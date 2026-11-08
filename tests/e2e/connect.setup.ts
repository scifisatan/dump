import { test as setup } from '@playwright/test';
import { CONNECTED } from '../../playwright.config';
import { onboard } from './servers';

setup('onboard the web client with the home server', async ({ page }) => {
  await onboard(page);
  await page.context().storageState({ path: CONNECTED });
});
