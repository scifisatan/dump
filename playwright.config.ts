import { defineConfig, devices } from '@playwright/test';

// Two API servers with isolated storage, plus the static web client both of them allow.
const api = (port: number, state: string) => ({
  command: `npx wrangler dev --port ${port} --local-upstream localhost:${port} --persist-to .wrangler/${state} --env-file tests/e2e/server.env`,
  url: `http://localhost:${port}`,
  reuseExistingServer: false,
  timeout: 180_000,
});
export const CONNECTED = 'test-results/connected.json';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: { baseURL: 'http://localhost:6194', trace: 'retain-on-failure' },
  projects: [
    { name: 'setup', testMatch: /\.setup\.ts$/, use: devices['Desktop Chrome'] },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: CONNECTED },
    },
  ],
  webServer: [
    api(6192, 'test-state'),
    api(6193, 'test-state-peer'),
    // Served like production (static assets with _headers), so the CSP applies to every test.
    {
      command:
        'npm run build:client && npx wrangler dev --config wrangler.client.jsonc --port 6194',
      url: 'http://localhost:6194',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
