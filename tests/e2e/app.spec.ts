import { expect, test, type Page } from '@playwright/test';

test('two devices merge offline captures, persist through reload, and honor deletion', async ({
  browser,
}) => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const desktop = await browser.newContext();
  const a = await phone.newPage();
  const b = await desktop.newPage();
  const suffix = crypto.randomUUID().slice(0, 8);
  const first = `offline thought ${suffix}`;
  const second = `desktop thought ${suffix}`;
  await a.goto('/');
  await b.goto('/');
  await expect(a.getByRole('textbox', { name: 'Capture a thought' })).toBeEnabled();
  await expect(b.getByRole('textbox', { name: 'Capture a thought' })).toBeEnabled();
  await a.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await a.reload();
  await expect(a.getByRole('textbox', { name: 'Capture a thought' })).toBeEnabled();
  await phone.setOffline(true);
  await a.getByRole('textbox', { name: 'Capture a thought' }).fill(first);
  await a.getByRole('button', { name: 'Save dump', exact: true }).click();
  await expect(a.getByRole('article').getByText(first, { exact: true })).toHaveCount(1);
  await expect(a.getByRole('status')).toContainText('Offline · saved here');
  await a.reload();
  await expect(a.getByRole('article').getByText(first, { exact: true })).toBeVisible();
  await b.getByRole('textbox', { name: 'Capture a thought' }).fill(second);
  await b.getByRole('button', { name: 'Save dump', exact: true }).click();
  await phone.setOffline(false);
  await expect(b.getByRole('article').getByText(first, { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(a.getByRole('article').getByText(second, { exact: true })).toBeVisible();
  await expect(b.getByRole('article').getByText(first, { exact: true })).toHaveCount(1);
  await phone.setOffline(true);
  await b.getByRole('button', { name: `Actions: ${first}`, exact: true }).click();
  await b.getByRole('menuitem', { name: 'Remove dump' }).click();
  await expect(b.getByRole('article').getByText(first, { exact: true })).toHaveCount(0);
  await phone.setOffline(false);
  await expect(a.getByRole('article').getByText(first, { exact: true })).toHaveCount(0);
  await phone.close();
  await desktop.close();
});

test('prefix filing, search, export and additive restore work', async ({ page }) => {
  const text = `Reading lamp ${crypto.randomUUID().slice(0, 8)} #home`;
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Capture a thought' }).fill(`!buy ${text}`);
  await page.getByRole('button', { name: 'Save dump', exact: true }).click();
  await page.getByRole('navigation').getByRole('link', { name: /^Buy/ }).click();
  await expect(page.getByRole('article').getByText(text, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Search your space' }).click();
  await page.getByRole('combobox', { name: 'Search dumps' }).fill(text);
  await page.getByRole('option').filter({ hasText: text }).click();
  await expect(page.getByRole('article').getByText(text, { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Export backup' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.locator('input[type="file"]').setInputFiles(path!);
  await expect(page.getByText('0 dumps restored. Existing items were kept.')).toBeVisible();
});

// Stands in for the Worker's Jev proxy: answers with `list` after `delay` ms.
async function fakeJev(page: Page, list: string | null, delay: number) {
  await page.route('/api/ping', (route) =>
    route.fulfill({ json: { ok: true, mode: 'local', classify: true } }),
  );
  await page.route('/api/classify', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    await route.fulfill({ json: { list, confidence: list ? 0.95 : 0 } }).catch(() => {});
  });
}

test('captures appear at once and Jev files them into a list afterwards', async ({ page }) => {
  await fakeJev(page, 'buy', 600);
  const text = `ceramic pour-over kettle ${crypto.randomUUID().slice(0, 8)}`;
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'Capture a thought' });
  await expect(input).toBeEnabled();
  await input.fill(text);
  await input.press('Enter');
  const card = page.getByRole('article').filter({ hasText: text });
  await expect(input).toHaveValue('');
  await expect(card).toContainText('Sorting…');
  // The inbox shows every open dump alongside the list Jev chose.
  await expect(card).toContainText('Buy');
  await expect(card).not.toContainText('Sorting…');
  await page.getByRole('navigation').getByRole('link', { name: /^Buy/ }).click();
  await expect(page.getByRole('article').getByText(text, { exact: true })).toBeVisible();
});

test('an unsure Jev defaults to To do, and filing by hand beats a late answer', async ({
  page,
}) => {
  await fakeJev(page, null, 1_500);
  const unsure = `hmm ${crypto.randomUUID().slice(0, 8)}`;
  const manual = `manual thought ${crypto.randomUUID().slice(0, 8)}`;
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'Capture a thought' });
  await expect(input).toBeEnabled();
  await input.fill(unsure);
  await input.press('Enter');
  await input.fill(manual);
  await input.press('Enter');
  await page.getByRole('button', { name: `Actions: ${manual}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Ideas' }).click();
  await expect(page.getByRole('article').filter({ hasText: unsure })).toContainText('To do');
  const card = page.getByRole('article').filter({ hasText: manual });
  await expect(card).toContainText('Ideas');
  await expect(card).not.toContainText('To do');
});

test('without Jev, captures stay in the inbox unfiled', async ({ page }) => {
  // Test builds never have a Jev key, so /api/ping reports classification off.
  const text = `unsorted thought ${crypto.randomUUID().slice(0, 8)}`;
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'Capture a thought' });
  await expect(input).toBeEnabled();
  await input.fill(text);
  await input.press('Enter');
  const card = page.getByRole('article').filter({ hasText: text });
  await expect(card).toBeVisible();
  await page.waitForTimeout(500);
  await expect(card).not.toContainText('Sorting…');
  await expect(card).not.toContainText('To do');
  await page.getByRole('button', { name: 'Sort inbox' }).click();
  const dialog = page.getByRole('dialog');
  // Every list gets a button, custom ones included, and number keys follow list order.
  const listLinks = page.getByRole('navigation').getByRole('link', { name: /^(?!Inbox|Done)/ });
  const listButtons = dialog
    .getByRole('button')
    .filter({ hasNot: page.getByText(/^(Remove|Skip|Close)$/) });
  await expect(dialog.getByRole('button', { name: /^Ideas/ })).toContainText('1');
  expect(await listButtons.count()).toBeGreaterThanOrEqual(await listLinks.count());
  const remaining = async () =>
    Number((await dialog.getByText(/thoughts? to give a home/).textContent())?.match(/\d+/)?.[0]);
  const before = await remaining();
  await page.keyboard.press('1');
  await expect.poll(remaining).toBe(before - 1);
});

test('clearing done removes every completed dump after a confirm click', async ({ page }) => {
  const text = `finished thought ${crypto.randomUUID().slice(0, 8)}`;
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'Capture a thought' });
  await expect(input).toBeEnabled();
  await input.fill(text);
  await input.press('Enter');
  await page.getByRole('button', { name: `Complete: ${text}` }).click();
  await page.goto('/done');
  const card = page.getByRole('article').filter({ hasText: text });
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Clear done' }).click();
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: /^Clear \d+\?$/ }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Clear done' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('article').filter({ hasText: text })).toHaveCount(0);
});

test('live sync reaches an open device without polling', async ({ browser, request }) => {
  const aContext = await browser.newContext();
  const bContext = await browser.newContext();
  const a = await aContext.newPage();
  const b = await bContext.newPage();
  await a.goto('/');
  await b.goto('/');
  await expect(b.getByRole('status')).toContainText('Saved · local development');
  const text = `Live sync ${crypto.randomUUID().slice(0, 8)}`;
  await a.getByRole('textbox', { name: 'Capture a thought' }).fill(text);
  await a.getByRole('button', { name: 'Save dump', exact: true }).click();
  // No polling: the edit arrives over the open WebSocket.
  await expect(b.getByRole('article').getByText(text, { exact: true })).toBeVisible({
    timeout: 5_000,
  });
  // Plain requests are refused; only WebSocket upgrades reach the sync server.
  expect((await request.get('/api/sync')).status()).toBe(426);
  await aContext.close();
  await bContext.close();
});

test('mobile layout fits and navigation is usable', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Capture a thought' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: /^Ideas/ })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ideas');
  await context.close();
});

test('custom lists, filing and renaming sync and survive reload', async ({ browser }) => {
  const aContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const bContext = await browser.newContext();
  const a = await aContext.newPage();
  const b = await bContext.newPage();
  const name = `Books-${crypto.randomUUID().slice(0, 6)}`;
  const thought = `Read something slow ${name}`;
  await a.goto('/');
  await b.goto('/');
  await a.getByRole('button', { name: 'Create new list' }).click();
  await a.getByRole('textbox', { name: 'List name' }).fill(name);
  await a.getByRole('button', { name: 'Create list', exact: true }).click();
  await expect(a.getByRole('heading', { level: 1 })).toHaveText(new RegExp(name));
  await expect(a.getByRole('heading', { name: 'Room for something good.' })).toBeVisible();
  await a.screenshot({ path: 'test-results/empty-list-desktop.png' });
  await a
    .getByRole('textbox', { name: 'Capture a thought' })
    .fill(`!${name.toLowerCase()} ${thought}`);
  await a.getByRole('button', { name: 'Save dump', exact: true }).click();
  await expect(a.getByRole('article').getByText(thought, { exact: true })).toBeVisible();
  // The composer moves from the centered empty state to the bottom and keeps focus.
  await expect(a.getByRole('textbox', { name: 'Capture a thought' })).toBeFocused();
  const bLink = (label: string) =>
    b.getByRole('navigation').getByRole('link', { name: new RegExp(`^${label}`) });
  await bLink(name).click({ timeout: 20_000 });
  await expect(b.getByRole('article').getByText(thought, { exact: true })).toBeVisible();
  await a.getByRole('button', { name: 'Edit list', exact: true }).click();
  await a.getByRole('textbox', { name: 'List name' }).fill(`${name} shelf`);
  await a.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(b.getByRole('heading', { level: 1 })).toHaveText(`${name} shelf`);
  await expect(bLink(`${name} shelf`)).toBeVisible();
  await a.reload();
  await expect(a.getByRole('heading', { level: 1 })).toHaveText(`${name} shelf`);
  await expect(a.getByRole('article').getByText(thought, { exact: true })).toBeVisible();
  await a.screenshot({ path: 'test-results/list-desktop.png' });
  await aContext.close();
  await bContext.close();
});

test('dialogs center, restore focus, and theme preference survives reload', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('button', { name: 'Search your space' });
  await search.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Search dumps' })).toBeFocused();
  const centered = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return (
      Math.abs(rect.x + rect.width / 2 - innerWidth / 2) < 2 &&
      Math.abs(rect.y + rect.height / 2 - innerHeight / 2) < 2
    );
  });
  expect(centered).toBe(true);
  await page.keyboard.press('Escape');
  await expect(search).toBeFocused();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('textbox', { name: 'Capture a thought' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/inbox-dark.png', fullPage: true });
});

test('mobile inbox, sheet focus, reduced motion, and dialog fit', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const bounds = await page.getByRole('dialog').boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: 'test-results/settings-mobile.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/inbox-mobile.png' });
  await context.close();
});

test('marketing is separate from notebook initialization and preserves the original logo', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  await page.goto('/marketing');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your mind is for ideas.');
  await expect(
    page.getByRole('link', { name: 'About Dump' }).locator('svg').locator('..'),
  ).toHaveCSS('background-color', 'rgb(216, 238, 121)');
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  expect(apiRequests).toEqual([]);
  await page.screenshot({ path: 'test-results/marketing-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/marketing-mobile.png', fullPage: true });
  await context.close();
});
