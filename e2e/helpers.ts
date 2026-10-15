import { expect, type Page, type TestInfo } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Hidden only while capturing screenshots: the Next.js dev-mode indicator.
export const screenshotStyle = fileURLToPath(new URL('./screenshot.css', import.meta.url));

export const isMobile = (info: TestInfo) => Boolean(info.project.use.isMobile);

/** Collects uncaught page errors; call the returned check at the end of a test. */
export function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  return () => expect(errors, 'uncaught errors in the page').toEqual([]);
}

/** Opens a Hub route (hash routing) and waits until the app is idle. */
export async function openHub(page: Page, route: string) {
  await page.goto(`/aplikace#${route}`);
  await page.waitForLoadState('networkidle');
  // The Next.js dev overlay badge sits over the mobile tab bar and would intercept clicks (dev server only).
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
}

export const heading = (page: Page, name: string | RegExp) => page.getByRole('heading', { level: 1, name });
