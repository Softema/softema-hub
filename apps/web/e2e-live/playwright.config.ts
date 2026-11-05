import { defineConfig } from '@playwright/test';

// Live mode against a running API and PostgreSQL. Started by `pnpm test:e2e:live`.
export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: '../test-results-live',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', browserName: 'chromium', locale: 'cs-CZ' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
});
