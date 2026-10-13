import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';

// Visual reference = the current Vinext prototype. Next.js projects compare
// against the very same snapshot files, so any visual drift fails the run.
// Servers are started manually (see e2e/README.md); nothing is auto-launched.
const vinextURL = process.env.E2E_VINEXT_URL ?? 'http://localhost:5173';
const nextURL = process.env.E2E_NEXT_URL ?? 'http://localhost:3000';

const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const snapshots = (device: string) => `{testDir}/__screenshots__/${device}/{arg}-{platform}{ext}`;

type Project = NonNullable<PlaywrightTestConfig['projects']>[number];
const project = (target: string, baseURL: string, device: 'desktop' | 'mobile'): Project => ({
  name: `${target}-${device}`,
  snapshotPathTemplate: snapshots(device),
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
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'device', maxDiffPixels: 0 },
  },
  use: {
    locale: 'cs-CZ',
    timezoneId: 'Europe/Prague',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [
    project('vinext', vinextURL, 'desktop'),
    project('vinext', vinextURL, 'mobile'),
    project('next', nextURL, 'desktop'),
    project('next', nextURL, 'mobile'),
  ],
});
