import { test as setup } from '@playwright/test';
import { CONNECTED } from '../../playwright.config';
import { onboard } from './servers';

// Other tests open a client already connected to the home server, as a returning owner would.
setup('onboard the web client with the home server', async ({ page }) => {
  await onboard(page);
  await page.context().storageState({ path: CONNECTED });
});
