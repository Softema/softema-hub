import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';

// Reference screenshots were captured from the original Vinext prototype and the
// Next.js build matches them pixel for pixel; any visual drift fails the run.
// The server is started manually (see e2e/README.md); nothing is auto-launched.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

type Project = NonNullable<PlaywrightTestConfig['projects']>[number];
const project = (device: 'desktop' | 'mobile'): Project => ({
  name: device,
  snapshotPathTemplate: `{testDir}/__screenshots__/${device}/{arg}-{platform}{ext}`,
  use: { browserName: 'chromium', baseURL, ...(device === 'desktop' ? desktop : mobile) },
});

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Never write reference images implicitly; use test:e2e:reference for that.
  updateSnapshots: 'none',
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'device', maxDiffPixels: 0, threshold: 0 },
  },
  use: {
    locale: 'cs-CZ',
    timezoneId: 'Europe/Prague',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [project('desktop'), project('mobile')],
});
