import { expect, test, type Page } from '@playwright/test';
import { capture, deviceOnly, openList } from './servers';

test('a returning visitor opens the notebook at / under the CSP, without the landing page', async ({
  page,
}) => {
  const landingCode: string[] = [];
  const violations: string[] = [];
  page.on('request', (request) => {
    if (/\/assets\/(Marketing|Onboarding)-/.test(request.url())) landingCode.push(request.url());
  });
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text());
  });
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
  await expect(page.getByRole('textbox', { name: 'Capture a thought' })).toBeEnabled();
  await expect(page.getByRole('status', { name: 'Sync status' })).toContainText(
    'Saved · local development',
  );
  await expect(page.getByRole('progressbar', { name: 'Opening Dump' })).toBeHidden();
  expect(landingCode).toEqual([]);
  expect(violations).toEqual([]);
});

test('a slow load shows the loading screen in the saved theme, then the notebook', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('dump-theme', 'dark'));
  // Holds the app's code back, as a slow network would.
  let arrive = () => {};
  const arrived = new Promise<void>((resolve) => (arrive = resolve));
  await page.route(/\/assets\/index-[\w-]+\.js$/, async (route) => {
    await arrived;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'commit' });
  const loading = page.getByRole('progressbar', { name: 'Opening Dump' });
  await expect(loading).toHaveCSS('opacity', '1');
  await expect(page.locator('html')).toHaveClass(/dark/);
  // The dump theme's dark body colour, #12140e (index.html repeats it for the loading screen).
  await expect(loading).toHaveCSS('background-color', 'rgb(18, 20, 14)');
  await page.screenshot({ path: 'test-results/loading-dark.png' });
  arrive();
  await expect(page.getByRole('textbox', { name: 'Capture a thought' })).toBeEnabled();
  await expect(loading).toBeHidden();
});

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
  await expect(a.getByRole('status', { name: 'Sync status' })).toContainText(
    'Offline · saved here',
  );
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
  await page
    .getByRole('article')
    .filter({ hasText: text })
    .getByRole('button', { name: 'Open Buy' })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Buy');
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
  // Astryx also repeats each toast in a screen-reader announcement, so look inside the toasts.
  await expect(
    page
      .getByRole('region', { name: 'Notifications' })
      .getByText('0 dumps restored. Existing items were kept.'),
  ).toBeVisible();
});

async function fakeJev(page: Page, list: string | null, delay: number) {
  await page.route('**/api/ping', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...(await response.json()), classify: true } });
  });
  await page.route('**/api/classify', async (route) => {
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
  await expect(card.getByRole('button', { name: 'Open Buy' })).toBeVisible();
  await expect(card).not.toContainText('Sorting…');
  await card.getByRole('button', { name: 'Open Buy' }).click();
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
  // A card's closed actions menu stays in its DOM, so check the list chip, not the card's text.
  await expect(
    page
      .getByRole('article')
      .filter({ hasText: unsure })
      .getByRole('button', { name: 'Open To do' }),
  ).toBeVisible();
  const card = page.getByRole('article').filter({ hasText: manual });
  await expect(card.getByRole('button', { name: 'Open Ideas' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Open To do' })).toHaveCount(0);
});

test('without Jev, captures stay in the inbox unfiled', async ({ page }) => {
  // E2e servers never have a Jev key, so /api/ping reports classification off.
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
  await expect(card.getByRole('button', { name: /^Open / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Search your space' }).click();
  const lists = await page
    .getByRole('group', { name: 'Lists', exact: true })
    .getByRole('option')
    .filter({ hasNotText: 'New list' })
    .count();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sort inbox' }).click();
  const dialog = page.getByRole('dialog');
  const listButtons = dialog
    .getByRole('button')
    .filter({ hasNot: page.getByText(/^(Remove|Skip|Close)$/) });
  await expect(dialog.getByRole('button', { name: /^Ideas/ })).toContainText('1');
  expect(lists).toBeGreaterThanOrEqual(5);
  expect(await listButtons.count()).toBeGreaterThanOrEqual(lists);
  const count = dialog.getByText(/thoughts? to give a home/);
  const remaining = async () =>
    (await count.count()) ? Number((await count.textContent())?.match(/\d+/)?.[0]) : 0;
  const before = await remaining();
  await page.keyboard.press('1');
  await expect.poll(remaining).toBe(before - 1);
});

test('Today shows what is overdue, due and coming up, and a day can move or clear', async ({
  page,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const late = `pay the rent ${suffix} 2020-01-05`;
  const due = `call the bank today ${suffix}`;
  const plain = `lunch tomorrow ${suffix}`;
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Today', exact: true })).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Capture a thought' });
  await expect(input).toBeEnabled();
  await input.fill(late);
  await input.press('Enter');
  await input.fill(due);
  const skip = page.getByRole('button', { name: 'Dump without a date' });
  await expect(page.locator('form').filter({ has: skip })).toContainText('Due Today');
  await input.press('Enter');
  await input.fill(plain);
  await skip.click();
  await expect(skip).toHaveCount(0);
  await input.press('Enter');
  const section = (name: string) => page.getByRole('region', { name, exact: true });
  const card = (text: string) => page.getByRole('article').filter({ hasText: text });
  await expect(section('Overdue').getByRole('article').filter({ hasText: late })).toBeVisible();
  await expect(section('Due today').getByRole('article').filter({ hasText: due })).toBeVisible();
  await expect(
    section('Dumped today').getByRole('article').filter({ hasText: plain }),
  ).toBeVisible();
  await expect(card(plain).getByRole('button', { name: /change date$/ })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/today-desktop.png' });
  const days = ['Today', 'Tomorrow', 'Pick a day…', 'Clear date'];
  await page.getByRole('button', { name: `Actions: ${late}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Change date' }).click();
  await expect(page.getByRole('menu').last().getByRole('menuitem')).toHaveText(days);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await card(late)
    .getByRole('button', { name: /^Overdue .*: change date$/ })
    .click();
  await expect(page.getByRole('menuitem')).toHaveText(days);
  await page.getByRole('menuitem', { name: 'Tomorrow' }).click();
  await expect(section('Coming up').getByRole('article').filter({ hasText: late })).toBeVisible();
  await card(late)
    .getByRole('button', { name: /change date$/ })
    .click();
  await page.getByRole('menuitem', { name: 'Clear date' }).click();
  await expect(
    section('Dumped today').getByRole('article').filter({ hasText: late }),
  ).toBeVisible();
  await page.reload();
  await expect(
    section('Dumped today').getByRole('article').filter({ hasText: late }),
  ).toBeVisible();
  await expect(section('Due today').getByRole('article').filter({ hasText: due })).toBeVisible();
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
  await expect(b.getByRole('status', { name: 'Sync status' })).toContainText(
    'Saved · local development',
  );
  const text = `Live sync ${crypto.randomUUID().slice(0, 8)}`;
  await a.getByRole('textbox', { name: 'Capture a thought' }).fill(text);
  await a.getByRole('button', { name: 'Save dump', exact: true }).click();
  await expect(b.getByRole('article').getByText(text, { exact: true })).toBeVisible({
    timeout: 5_000,
  });
  const plain = await request.get('http://localhost:6192/api/sync', {
    headers: { Origin: 'http://localhost:6194' },
  });
  expect(plain.status()).toBe(426);
  await aContext.close();
  await bContext.close();
});

test('mobile layout fits and lists open from search and go back home', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Capture a thought' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await openList(page, 'Ideas');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ideas');
  await page.getByRole('link', { name: 'Back to your space' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your space');
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
  await a.getByRole('button', { name: 'Search your space' }).click();
  await a.getByRole('option', { name: 'New list', exact: true }).click();
  await a.getByRole('textbox', { name: 'List name' }).fill(name);
  await a.getByRole('button', { name: 'Create list', exact: true }).click();
  await expect(a.getByRole('heading', { level: 1 })).toHaveText(new RegExp(name));
  await expect(a.getByRole('heading', { name: 'Room for something good.' })).toBeVisible();
  await a.screenshot({ path: 'test-results/empty-list-desktop.png' });
  await a.getByRole('textbox', { name: 'Capture a thought' }).fill(thought);
  await a.getByRole('button', { name: 'Save dump', exact: true }).click();
  await expect(a.getByRole('article').getByText(thought, { exact: true })).toBeVisible();
  await expect(a.getByRole('textbox', { name: 'Capture a thought' })).toBeFocused();
  await openList(b, name);
  await expect(b.getByRole('article').getByText(thought, { exact: true })).toBeVisible();
  await a.getByRole('button', { name: 'Edit list', exact: true }).click();
  await a.getByRole('textbox', { name: 'List name' }).fill(`${name} shelf`);
  await a.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(b.getByRole('heading', { level: 1 })).toHaveText(`${name} shelf`);
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
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Search dumps' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(search).toBeFocused();
  // The palette is pinned near the top, and Enter right after typing opens the first match.
  await search.click();
  const palette = page.getByRole('dialog', { name: 'Find something in your space' });
  await page.keyboard.type('Settings');
  await expect
    .poll(() =>
      palette.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.y + rect.height / 2 < innerHeight / 2 - 40;
      }),
    )
    .toBe(true);
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  // Standard dialogs center.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Astryx dialogs ease in, so wait until the dialog settles in the middle.
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          Math.abs(rect.x + rect.width / 2 - innerWidth / 2) < 2 &&
          Math.abs(rect.y + rect.height / 2 - innerHeight / 2) < 2
        );
      }),
    )
    .toBe(true);
  await page.getByRole('radio', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('textbox', { name: 'Capture a thought' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/home-dark.png', fullPage: true });
});

test('mobile home, dialog focus, reduced motion, and dialog fit', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your space');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const trigger = page.getByRole('button', { name: 'Settings', exact: true });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  const bounds = await page.getByRole('dialog').boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: 'test-results/settings-mobile.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/home-mobile.png' });
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
  await page.getByRole('link', { name: 'Open your space' }).first().click();
  await expect(page.getByRole('textbox', { name: 'Capture a thought' })).toBeEnabled();
  await expect(page.getByRole('progressbar', { name: 'Opening Dump' })).toBeHidden();
  await context.close();
});

test('the top bar holds the logo, Sort inbox while dumps wait, and search with Settings', async ({
  browser,
}) => {
  const page = await deviceOnly(browser, {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const header = page.getByRole('navigation', { name: 'Dump' });
  const logo = header.getByRole('link', { name: 'Dump home' });
  await expect(logo).toBeVisible();
  await expect(logo.getByText('dump.', { exact: true })).toBeHidden();
  await expect(header.getByRole('button', { name: 'Search your space' })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  const status = page.getByRole('status', { name: 'Sync status' });
  await expect(status).toHaveText('Saved on this device');
  expect((await status.boundingBox())?.width).toBeLessThanOrEqual(1);
  await expect(header.getByRole('button', { name: 'Sort inbox' })).toHaveCount(0);
  await capture(page, `waiting for a home ${crypto.randomUUID().slice(0, 8)}`);
  await expect(header.getByRole('button', { name: 'Sort inbox' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('combobox', { name: 'Search dumps' })).toBeFocused();
  for (const name of ['Today', 'Done', 'New list', 'Ideas'])
    await expect(page.getByRole('option', { name, exact: true })).toBeVisible();
  await page.getByRole('option', { name: 'Done', exact: true }).click();
  await expect(header.getByRole('link', { name: 'Back to your space' })).toBeVisible();
  await expect(header.getByRole('heading', { level: 1 })).toHaveText('Done');
  await expect(header).toContainText(/Done\s*0/);
  await expect(logo).toHaveCount(0);
  await page.context().close();
});

test('a path that names no view shows home, and only Done has no composer', async ({ browser }) => {
  const page = await deviceOnly(browser);
  const heading = page.getByRole('heading', { level: 1 });
  const composer = page.getByRole('textbox', { name: 'Capture a thought' });
  for (const path of ['/nowhere', '/lists/no-such-list']) {
    await page.goto(path);
    await expect(heading).toHaveText('Your space');
  }
  await page.goto('/done');
  await expect(page.getByRole('heading', { name: 'Small wins will live here.' })).toBeVisible();
  await expect(composer).toHaveCount(0);
  await page.goto('/lists/ideas');
  await expect(page.getByRole('heading', { name: 'Room for something good.' })).toBeVisible();
  const box = (await composer.boundingBox())!;
  const middle = box.y + box.height / 2;
  expect(middle).toBeGreaterThan(720 * 0.25);
  expect(middle).toBeLessThan(720 * 0.75);
  await page.goto('/');
  await capture(page, 'first thought');
  await capture(page, 'second thought');
  await expect(page.getByRole('article')).toHaveText([/first thought/, /second thought/]);
  const last = (await page.getByRole('article').last().boundingBox())!;
  expect((await composer.boundingBox())!.y).toBeGreaterThan(last.y + last.height);
  await page.getByRole('button', { name: 'Complete: first thought' }).click();
  await page.getByRole('link', { name: '1 done →' }).click();
  await expect(page.getByRole('article')).toHaveText([/first thought/]);
  await expect(composer).toHaveCount(0);
  await page.context().close();
});

test('home opens at Today’s heading when Today is taller than the screen, else at the bottom', async ({
  browser,
}) => {
  const page = await deviceOnly(browser, { viewport: { width: 1000, height: 600 } });
  // Where the scrolling view stands, and where Today's heading is in it.
  const position = () =>
    page.evaluate(() => {
      const today = document.querySelector('[aria-label="Today"]');
      let scroller = (today ?? document.querySelector('article'))!.parentElement!;
      while (!/auto|scroll/.test(getComputedStyle(scroller).overflowY))
        scroller = scroller.parentElement!;
      return {
        top: scroller.scrollTop,
        bottom: scroller.scrollHeight - scroller.clientHeight,
        today: today
          ? today.getBoundingClientRect().top - scroller.getBoundingClientRect().top
          : null,
      };
    });
  await capture(page, 'already finished');
  await page.getByRole('button', { name: 'Complete: already finished' }).click();
  await capture(page, 'one open thought');
  // Reload only once this device has saved, or the last captures are lost.
  const saved = page.getByRole('status', { name: 'Sync status' });
  await expect(page.getByRole('article').getByText('one open thought')).toBeVisible();
  await expect(saved).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('link', { name: '1 done →' })).toBeVisible();
  await expect.poll(async () => (await position()).bottom - (await position()).top).toBe(0);

  for (let n = 1; n <= 14; n++) await capture(page, `!ideas idea ${n}`);
  await expect(page.getByRole('article').getByText('idea 14', { exact: true })).toBeVisible();
  await expect(saved).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('article').getByText('idea 14', { exact: true })).toBeAttached();
  await expect.poll(async () => Math.abs((await position()).today ?? 99)).toBeLessThan(4);
  const opened = await position();
  expect(opened.top).toBeGreaterThan(0);
  expect(opened.top).toBeLessThan(opened.bottom);

  await capture(page, 'the newest thought');
  await expect(
    page.getByRole('article').filter({ hasText: 'the newest thought' }),
  ).toBeInViewport();

  await page.goto('/lists/ideas');
  await expect(page.getByRole('article').getByText('idea 14', { exact: true })).toBeInViewport();
  const list = await position();
  expect(list.bottom).toBeGreaterThan(0);
  expect(list.bottom - list.top).toBeLessThan(2);
  await page.context().close();
});

test('deleting a list takes a confirm click', async ({ browser }) => {
  const page = await deviceOnly(browser);
  const name = `Trips-${crypto.randomUUID().slice(0, 6)}`;
  await page.getByRole('button', { name: 'Search your space' }).click();
  await page.getByRole('option', { name: 'New list', exact: true }).click();
  await page.getByRole('textbox', { name: 'List name' }).fill(name);
  await page.getByRole('button', { name: 'Create list', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  await page.getByRole('button', { name: 'Edit list', exact: true }).click();
  await page.getByRole('button', { name: 'Delete list', exact: true }).click();
  const confirm = page.getByRole('button', { name: 'Delete list — its dumps get re-sorted' });
  await expect(confirm).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
  await confirm.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your space');
  await page.getByRole('button', { name: 'Search your space' }).click();
  await expect(page.getByRole('option', { name: 'Ideas', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name, exact: true })).toHaveCount(0);
  await page.context().close();
});
