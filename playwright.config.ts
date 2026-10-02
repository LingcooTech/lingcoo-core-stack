import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'test/e2e',
  workers: 1,
  timeout: 60000,
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:15439', headless: true, trace: 'retain-on-failure' },
  reporter: 'list',
  webServer: {
    command: 'node dist/server.js',
    url: 'http://127.0.0.1:15439/ready',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
