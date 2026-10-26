import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', workers: 1, retries: 0,
  reporter: [['list'], ['junit', { outputFile: '../reports/frontend/e2e/junit.xml' }], ['html', { outputFolder: '../reports/frontend/e2e/html', open: 'never' }]],
  outputDir: '../reports/frontend/e2e/results',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure', serviceWorkers: 'block' },
  webServer: { command: 'npm run preview', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 30000 },
});
