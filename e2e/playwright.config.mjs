import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const chromiumLocal = process.env.ORQ_E2E_CHROMIUM
  || (process.platform === 'linux' && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : null);

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  outputDir: './test-results',
  use: {
    baseURL: 'http://127.0.0.1:17777',
    browserName: 'chromium',
    launchOptions: chromiumLocal ? { executablePath: chromiumLocal } : {},
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node fixture-server.mjs',
    url: 'http://127.0.0.1:17777/health',
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
