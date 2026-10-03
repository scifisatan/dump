import { expect, test } from '@playwright/test';
import {
  capture,
  CLIENT,
  connectServer,
  HOME,
  onboard,
  OWNER_KEY,
  PEER,
  startOnboarding,
} from './servers';

// These tests start from a browser that has never set up a notebook.
test.use({ storageState: { cookies: [], origins: [] } });

const landing = 'Your mind is for ideas.';

test('a new visitor gets the landing page in place and onboards with a server', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(landing);
  await expect(page.getByRole('progressbar', { name: 'Opening Dump' })).toBeHidden();
  expect(new URL(page.url()).pathname).toBe('/');
  await page.goto('/lists/ideas');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(landing);
  expect(new URL(page.url()).pathname).toBe('/lists/ideas');
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  await page.getByRole('button', { name: 'Get started' }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Where should your thoughts live?' }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/onboarding-desktop.png' });
  await page.getByRole('button', { name: /Sync with your server/ }).click();
  // A wrong key saves nothing.
  await connectServer(page, HOME, undefined, 'not-the-owner-key-not-the-owner-key');
  await expect(page.getByText('That owner key doesn’t match this server.')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('dump-connections'))).toBeNull();
  await page.getByLabel('Owner key').fill(OWNER_KEY);
  await page.getByRole('button', { name: 'Connect to this server', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved · local development');
  const text = `first connection ${crypto.randomUUID().slice(0, 8)}`;
  await capture(page, `!ideas ${text}`);
  await page.reload();
  await expect(page.getByRole('article').getByText(text, { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText(`Current: ${HOME}`)).toBeVisible();
  await page.screenshot({ path: 'test-results/server-settings-mobile.png' });
});

test('a device-only notebook never contacts a server and can join one later', async ({
  page,
  browser,
}) => {
  const serverRequests: string[] = [];
  page.on('request', (request) => {
    if ([HOME, PEER].includes(new URL(request.url()).origin)) serverRequests.push(request.url());
  });
  await startOnboarding(page);
  await page.getByRole('button', { name: /Just this device/ }).click();
  await expect(page.getByRole('status')).toContainText('Saved on this device');
  const text = `device only ${crypto.randomUUID().slice(0, 8)}`;
  await capture(page, `!ideas ${text}`);
  await expect(page.getByRole('article').getByText(text, { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('article').getByText(text, { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Saved on this device');
  expect(serverRequests).toEqual([]);
  // Connecting later adds this notebook's thoughts to the server's.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('This notebook lives only in this browser.')).toBeVisible();
  await connectServer(page, PEER, 'Connect and sync');
  await expect(page.getByRole('status')).toContainText('Saved · local development');
  await expect(page.getByRole('article').getByText(text, { exact: true })).toBeVisible();
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await onboard(other, PEER);
  await expect(other.getByRole('article').getByText(text, { exact: true })).toBeVisible();
  await otherContext.close();
});

test('switching between two servers isolates databases, tabs, and live sync', async ({
  page,
  context,
  browser,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const homeText = `home notebook ${suffix}`;
  const peerText = `peer notebook ${suffix}`;
  await onboard(page, HOME);
  await capture(page, `!ideas ${homeText}`);
  const oldTab = await context.newPage();
  await oldTab.goto('/');
  await expect(oldTab.getByRole('article').getByText(homeText, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await connectServer(page, PEER, 'Switch to this server');
  await expect(page.getByRole('status')).toContainText('Saved · local development');
  await expect(page.getByRole('article').getByText(homeText, { exact: true })).toHaveCount(0);
  await capture(page, `!ideas ${peerText}`);
  const peerContext = await browser.newContext();
  const peerDevice = await peerContext.newPage();
  await onboard(peerDevice, PEER);
  await expect(peerDevice.getByRole('article').getByText(peerText, { exact: true })).toBeVisible();
  await expect(peerDevice.getByRole('article').getByText(homeText, { exact: true })).toHaveCount(0);
  await expect(oldTab.getByRole('article').getByText(peerText, { exact: true })).toHaveCount(0);
  await capture(oldTab, `!ideas still home ${suffix}`);
  await expect(
    page.getByRole('article').getByText(`still home ${suffix}`, { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: HOME, exact: true }).click();
  await expect(page.getByRole('article').getByText(homeText, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('article').getByText(`still home ${suffix}`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('article').getByText(peerText, { exact: true })).toHaveCount(0);
  const databases = await page.evaluate(() => indexedDB.databases());
  expect(databases.filter((database) => database.name?.startsWith('dump-v1-'))).toHaveLength(2);
  await peerContext.close();
});

test('a changed server identity keeps existing data local and blocks the WebSocket', async ({
  page,
}) => {
  const text = `identity guard ${crypto.randomUUID().slice(0, 8)}`;
  await onboard(page);
  await capture(page, `!ideas ${text}`);
  await expect(page.getByRole('status')).toContainText('Saved · local development');
  await page.route('**/api/ping', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...(await response.json()), instanceId: 'f'.repeat(64) } });
  });
  const sockets: string[] = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await page.reload();
  await expect(page.getByText(/This address now belongs to a different notebook/)).toBeVisible();
  await expect(page.getByRole('article').getByText(text, { exact: true })).toBeVisible();
  expect(sockets).toEqual([]);
});

test('a device whose key stops working is signed out, keeps its notes, and signs back in', async ({
  page,
}) => {
  const text = `rotated key ${crypto.randomUUID().slice(0, 8)}`;
  await onboard(page);
  await capture(page, `!ideas ${text}`);
  // Stands in for the owner rotating OWNER_KEY: this device's saved key no longer matches.
  await page.evaluate(() => {
    for (const name of Object.keys(localStorage))
      if (name.startsWith('dump-owner-key:'))
        localStorage.setItem(name, 'an-old-key-an-old-key-an-old-key');
  });
  const sockets: string[] = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Signed out');
  await expect(page.getByRole('article').getByText(text, { exact: true })).toBeVisible();
  expect(sockets).toEqual([]);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Owner key').fill(OWNER_KEY);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Signed in. Syncing again.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('status')).toContainText('Saved · local development');
});

test('the API needs the owner key and answers only listed client origins', async ({ request }) => {
  const origin = { Origin: CLIENT };
  const ping = await request.get(`${HOME}/api/ping`, { headers: origin });
  expect(ping.ok()).toBe(true);
  expect(ping.headers()['access-control-allow-origin']).toBe(CLIENT);
  const { auth, instanceId } = await ping.json();
  expect(auth).toBe('owner-key');
  for (const authorization of [
    {},
    { Authorization: 'Bearer not-the-owner-key-not-the-owner-key' },
  ]) {
    const headers = { ...origin, ...authorization };
    expect((await request.post(`${HOME}/api/sync-ticket`, { headers })).status()).toBe(401);
    const classify = await request.post(`${HOME}/api/classify`, {
      headers,
      data: { text: 'a thought', lists: [] },
    });
    expect(classify.status()).toBe(401);
  }
  const issued = await request.post(`${HOME}/api/sync-ticket`, {
    headers: { ...origin, Authorization: `Bearer ${OWNER_KEY}` },
  });
  expect(issued.ok()).toBe(true);
  const { ticket } = await issued.json();
  const upgrade = { ...origin, Upgrade: 'websocket' };
  // Upgrades need a ticket bound to this notebook; a changed expiry breaks its signature.
  const forged = ticket.replace(/^\d+/, (expiry: string) => String(Number(expiry) - 1000));
  for (const query of [`instance=${instanceId}`, `instance=${instanceId}&ticket=${forged}`])
    expect((await request.get(`${HOME}/api/sync?${query}`, { headers: upgrade })).status()).toBe(
      401,
    );
  const wrongNotebook = await request.get(`${HOME}/api/sync?instance=wrong&ticket=${ticket}`, {
    headers: upgrade,
  });
  expect(wrongNotebook.status()).toBe(409);
  const preflight = await request.fetch(`${HOME}/api/sync-ticket`, {
    method: 'OPTIONS',
    headers: {
      ...origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization',
    },
  });
  expect(preflight.status()).toBe(204);
  expect(preflight.headers()['access-control-allow-headers']).toContain('Authorization');
  // Missing Origin and the server's own origin are refused too: the server hosts no UI.
  for (const path of ['/api/ping', '/api/sync'])
    for (const headers of [{ Origin: 'https://untrusted.example' }, { Origin: HOME }, {}]) {
      const rejected = await request.get(`${HOME}${path}`, { headers });
      expect(rejected.status()).toBe(403);
      expect(rejected.headers()['access-control-allow-origin']).toBeUndefined();
    }
});
