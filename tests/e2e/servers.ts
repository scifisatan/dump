import { expect, type Page } from '@playwright/test';

export const CLIENT = 'http://localhost:6194';
export const HOME = 'http://localhost:6192';
export const PEER = 'http://localhost:6193';
// Matches tests/e2e/server.env.
export const OWNER_KEY = 'e2e-owner-key-for-local-tests-only';

export async function openList(page: Page, label: string) {
  await page.getByRole('button', { name: 'Search your space' }).click();
  await page.getByRole('option', { name: label, exact: true }).click({ timeout: 20_000 });
}

export async function capture(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Capture a thought' }).fill(text);
  await page.getByRole('button', { name: 'Save dump', exact: true }).click();
}

export async function connectServer(
  page: Page,
  address: string,
  action = 'Connect to this server',
  key = OWNER_KEY,
) {
  await page.getByRole('textbox', { name: 'Server address' }).fill(address);
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(page.getByText('Dump server found')).toBeVisible();
  await page.getByLabel('Owner key').fill(key);
  await page.getByRole('button', { name: action, exact: true }).click();
}

export async function startOnboarding(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).first().click();
}

export async function onboard(page: Page, address = HOME) {
  await startOnboarding(page);
  await page.getByRole('button', { name: /Sync with your server/ }).click();
  await connectServer(page, address);
  await expect(page.getByRole('textbox', { name: 'Capture a thought' })).toBeEnabled();
  await expect(page.getByRole('status')).toContainText('Saved · local development');
}
