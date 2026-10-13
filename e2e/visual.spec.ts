import { test, expect, type Page, type Locator } from '@playwright/test';
import { heading, openHub, screenshotStyle, trackPageErrors } from './helpers';

// Reference screens of the prototype (mock data only, nothing is persisted).
type Screen = { name: string; route: string; prepare?: (page: Page) => Promise<void>; ready: (page: Page) => Locator };
const screens: Screen[] = [
  { name: 'dashboard', route: 'prehled', ready: p => heading(p, 'Dobrý den, Marie') },
  { name: 'contacts', route: 'kontakty', ready: p => heading(p, 'Kontakty') },
  { name: 'contact-detail', route: 'kontakty/1', ready: p => p.getByRole('heading', { level: 2, name: 'Jan Novák' }) },
  { name: 'campaign-wizard-basics', route: 'kampane/nova', ready: p => p.getByRole('heading', { name: 'Začněme tím podstatným.' }) },
  { name: 'campaign-wizard-content', route: 'kampane/sablony', ready: p => p.getByRole('heading', { name: 'E-mail, který bude radost číst.' }) },
  { name: 'campaign-report', route: 'kampane/2', ready: p => p.getByRole('heading', { level: 1, name: 'Jak na marketing, který přináší výsledky' }) },
  {
    name: 'email-editor',
    route: 'kampane/sablony',
    // Keyboard instead of a click: the pointer must not hover the editor canvas.
    prepare: p => p.getByRole('button', { name: 'Otevřít editor e-mailu' }).press('Enter'),
    ready: p => p.getByRole('button', { name: 'Uložit a zavřít' }),
  },
];

for (const screen of screens) {
  test(screen.name, async ({ page }) => {
    const noErrors = trackPageErrors(page);
    await openHub(page, screen.route);
    await screen.prepare?.(page);
    await expect(screen.ready(page)).toBeVisible();
    // Opening a screen can scroll; full-page captures must start from the top (sticky topbar).
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot(`${screen.name}.png`, { fullPage: true, stylePath: screenshotStyle });
    noErrors();
  });
}
