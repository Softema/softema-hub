import { test, expect } from '@playwright/test';
import { heading, isMobile, openHub, trackPageErrors } from './helpers';

// [sidebar label, page heading, hash route]. AI agenti is intentionally not covered.
const modules: [string, string, string][] = [
  ['Kontakty', 'Kontakty', 'kontakty'],
  ['Kampaně', 'E-mailové kampaně', 'kampane'],
  ['Automatizace', 'Automatizace', 'automatizace'],
  ['Platby', 'Platby', 'platby'],
  ['Kurzy a komunita', 'Kurzy a komunita', 'kurzy'],
  ['Webináře', 'Webináře', 'webinare'],
  ['Chatbot', 'Váš webový chatbot', 'chatbot'],
  ['Nastavení', 'Nastavení', 'nastaveni'],
  ['Přehled', 'Dobrý den, Marie 👋', 'prehled'],
];

test('sidebar navigation switches modules', async ({ page }, info) => {
  test.skip(isMobile(info), 'desktop sidebar');
  const noErrors = trackPageErrors(page);
  await openHub(page, 'prehled');
  for (const [label, title, route] of modules) {
    await page.locator('.hub-nav').getByRole('button', { name: new RegExp(`^${label}`) }).click();
    await expect(heading(page, title)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`#${route}$`));
  }
  noErrors();
});

test('mobile menu opens a module', async ({ page }, info) => {
  test.skip(!isMobile(info), 'mobile sidebar');
  const noErrors = trackPageErrors(page);
  await openHub(page, 'prehled');
  await page.getByRole('button', { name: 'Otevřít navigaci' }).click();
  await page.locator('.hub-nav').getByRole('button', { name: /^Kontakty/ }).click();
  await expect(heading(page, 'Kontakty')).toBeVisible();
  await expect(page.locator('.hub-nav')).toHaveCount(0);
  noErrors();
});

test('contact list → detail → back', async ({ page }) => {
  const noErrors = trackPageErrors(page);
  await openHub(page, 'kontakty');
  const openJan = () => page.getByRole('cell').getByRole('button', { name: /^Jan Novák/ }).click();
  const detail = page.getByRole('heading', { level: 2, name: 'Jan Novák' });

  await openJan();
  await expect(detail).toBeVisible();
  await expect(page).toHaveURL(/#kontakty\/1$/);
  await expect(page.getByText('Zaplacena faktura 202609028')).toBeVisible();

  await page.getByRole('button', { name: 'Zpět na kontakty' }).click();
  await expect(heading(page, 'Kontakty')).toBeVisible();
  await expect(page).toHaveURL(/#kontakty$/);

  await openJan();
  await expect(detail).toBeVisible();
  await page.goBack();
  await expect(heading(page, 'Kontakty')).toBeVisible();
  noErrors();
});

test('contact custom fields: add, validate, edit, remove', async ({ page }) => {
  const noErrors = trackPageErrors(page);
  await openHub(page, 'kontakty/1');
  const box = page.locator('section[aria-labelledby="custom-fields-title"]');
  const rows = box.locator('.custom-field-row');
  const dialog = page.getByRole('dialog');
  await expect(rows).toHaveCount(4);

  await box.getByRole('button', { name: 'Přidat vlastní pole' }).click();
  await dialog.getByRole('button', { name: 'Přidat pole' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Doplňte název pole.');
  await dialog.getByLabel('Název pole').fill('Obor');
  await dialog.getByRole('button', { name: 'Přidat pole' }).click();
  await expect(dialog.getByRole('alert')).toContainText('už u tohoto kontaktu existuje');
  await dialog.getByLabel('Název pole').fill('Web');
  await dialog.getByLabel('Hodnota').fill('novakstudio.cz');
  await dialog.getByRole('button', { name: 'Přidat pole' }).click();
  await expect(rows).toHaveCount(5);
  await expect(rows.last()).toContainText('novakstudio.cz');

  await rows.last().click();
  await dialog.getByLabel('Hodnota').fill('www.novakstudio.cz');
  await dialog.getByRole('button', { name: 'Uložit změny' }).click();
  await expect(rows.last()).toContainText('www.novakstudio.cz');
  await rows.last().click();
  await dialog.getByRole('button', { name: 'Odebrat pole' }).click();
  await expect(rows).toHaveCount(4);

  await page.getByRole('button', { name: 'Zpět na kontakty' }).click();
  await page.getByRole('cell').getByRole('button', { name: /^Petra Svobodová/ }).click();
  await expect(box.getByText('Zatím tu nejsou žádná vlastní pole.')).toBeVisible();
  noErrors();
});

test('new campaign → wizard → editor → back', async ({ page }) => {
  const noErrors = trackPageErrors(page);
  await openHub(page, 'kampane');
  await page.getByRole('button', { name: 'Nová kampaň' }).click();
  await expect(heading(page, 'Nová e-mailová kampaň')).toBeVisible();
  await expect(page).toHaveURL(/#kampane\/nova$/);

  await page.getByRole('button', { name: 'Pokračovat' }).click();
  await expect(page.getByRole('heading', { name: 'Komu dnes napíšeme?' })).toBeVisible();
  await page.getByRole('button', { name: 'Pokračovat' }).click();
  const contentStep = page.getByRole('heading', { name: 'E-mail, který bude radost číst.' });
  await expect(contentStep).toBeVisible();

  await page.getByRole('button', { name: 'Otevřít editor e-mailu' }).click();
  await expect(page.getByRole('button', { name: 'Uložit a zavřít' })).toBeVisible();
  await expect(page.locator('.editor-canvas .email-block')).toHaveCount(7);

  await page.getByRole('button', { name: 'Uložit a zavřít' }).click();
  await expect(contentStep).toBeVisible();
  await page.getByRole('button', { name: 'Všechny kampaně' }).click();
  await expect(heading(page, 'E-mailové kampaně')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Podzimní newsletter' })).toContainText('Koncept');
  noErrors();
});

test('public pages render', async ({ page }, info) => {
  test.skip(isMobile(info), 'desktop only');
  const noErrors = trackPageErrors(page);
  for (const path of ['/', '/funkce', '/prihlaseni', '/registrace', '/obnova-hesla']) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator('h1').first()).toBeVisible();
  }
  noErrors();
});
