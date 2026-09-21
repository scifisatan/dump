import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: { baseURL: 'http://localhost:6192', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build:test && npm run preview -- --mode test',
    url: 'http://localhost:6192',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
