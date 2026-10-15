import { test, expect, type Page, type Locator } from '@playwright/test';
import { heading, openHub, screenshotStyle, trackPageErrors } from './helpers';

// Reference screens of the prototype. Demo data are generated relative to the first start, so the clock is fixed:
// every run seeds the same data and shows the same dates.
const NOW = new Date('2026-10-15T10:00:00+02:00');
type Screen = { name: string; route: string; prepare?: (page: Page) => Promise<void>; ready: (page: Page) => Locator };
const screens: Screen[] = [
  { name: 'dashboard', route: 'prehled', ready: p => heading(p, 'Dobrý den, Marie') },
  { name: 'contacts', route: 'kontakty', ready: p => heading(p, 'Kontakty') },
  { name: 'contact-detail', route: 'kontakty/1', ready: p => p.getByRole('heading', { level: 2, name: 'Jan Novák' }) },
  { name: 'campaign-wizard-basics', route: 'kampane/nova', ready: p => heading(p, 'Nová kampaň') },
  { name: 'campaign-wizard-content', route: 'kampane/5/upravit?krok=3', ready: p => p.getByRole('heading', { name: 'Obsah e-mailu' }) },
  { name: 'campaign-report', route: 'kampane/2', ready: p => p.getByRole('heading', { level: 1, name: 'Jak na marketing, který přináší výsledky' }) },
  // the built-in block editor (campaign 5); Unlayer is a third-party iframe and is not part of the references
  { name: 'email-editor', route: 'kampane/5/editor', ready: p => p.getByRole('button', { name: 'Hotovo' }) },
];

for (const screen of screens) {
  test(screen.name, async ({ page }) => {
    const noErrors = trackPageErrors(page);
    await page.clock.setFixedTime(NOW);
    await openHub(page, screen.route);
    await screen.prepare?.(page);
    await expect(screen.ready(page)).toBeVisible();
    // Opening a screen can scroll; full-page captures must start from the top (sticky topbar).
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot(`${screen.name}.png`, { fullPage: true, stylePath: screenshotStyle });
    noErrors();
  });
}
