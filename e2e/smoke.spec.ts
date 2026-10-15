import { test, expect } from '@playwright/test';
import { heading, isMobile, openHub, trackPageErrors } from './helpers';

// [sidebar label, page heading, hash route]. AI agenti is intentionally not covered.
const modules: [string, string, string][] = [
  ['Kontakty', 'Kontakty', 'kontakty'],
  ['Kampaně', 'Kampaně', 'kampane'],
  ['Automatizace', 'Automatizace', 'automatizace'],
  ['Platby', 'Platby', 'platby'],
  ['Kurzy a produkty', 'Kurzy a komunita', 'kurzy'],
  ['Webináře', 'Webináře', 'webinare'],
  ['Chatbot', 'Váš webový chatbot', 'chatbot'],
  ['Nastavení', 'Nastavení', 'nastaveni'],
  ['Přehled', 'Dobrý den, Marie', 'prehled'],
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

test('dashboard sources link to the filtered contact list', async ({ page }) => {
  const noErrors = trackPageErrors(page);
  await openHub(page, 'prehled');
  const sources = page.locator('.dash-sources');
  const total = (await sources.locator('.src-donut-center strong').textContent())!.trim();
  const first = sources.locator('.src-row').first();
  const count = (await first.locator('.src-count').textContent())!.trim();
  expect(Number(total.replace(/\s/g, ''))).toBeGreaterThan(0);
  await first.click();
  await expect(page).toHaveURL(/#kontakty\?zdroj=.+&novi=30$/);
  await expect(page.locator('.pager')).toContainText(`z ${count} kontaktů`);
  noErrors();
});

test('contact list → detail → back', async ({ page }) => {
  const noErrors = trackPageErrors(page);
  await openHub(page, 'kontakty');
  // search ignores diacritics
  await page.getByRole('textbox', { name: /Hledat jméno/ }).fill('jan novak');
  const openJan = () => page.getByRole('cell').getByRole('button', { name: /^Jan Novák/ }).click();
  const detail = page.getByRole('heading', { level: 2, name: 'Jan Novák' });

  await openJan();
  await expect(detail).toBeVisible();
  await expect(page).toHaveURL(/#kontakty\/1$/);
  await expect(page.getByText(/^Vystavena faktura \d+/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Zpět na kontakty' }).click();
  await expect(heading(page, 'Kontakty')).toBeVisible();
  await expect(page).toHaveURL(/#kontakty$/);
  await page.goBack();
  await expect(detail).toBeVisible();
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
  await dialog.getByLabel('Hodnota').fill('novakstudio.example');
  await dialog.getByRole('button', { name: 'Přidat pole' }).click();
  await expect(rows).toHaveCount(5);
  await expect(rows.last()).toContainText('novakstudio.example');

  await rows.last().click();
  await dialog.getByLabel('Hodnota').fill('www.novakstudio.example');
  await dialog.getByRole('button', { name: 'Uložit změny' }).click();
  await expect(rows.last()).toContainText('www.novakstudio.example');
  // stored in the browser: survives a reload
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(rows.last()).toContainText('www.novakstudio.example');
  await rows.last().click();
  await dialog.getByRole('button', { name: 'Odebrat pole' }).click();
  await expect(rows).toHaveCount(4);
  noErrors();
});

test('workspaces keep their own contacts', async ({ page }, info) => {
  test.skip(isMobile(info), 'desktop sidebar');
  const noErrors = trackPageErrors(page);
  await openHub(page, 'kontakty/1');
  await page.getByRole('button', { name: 'Upravit kontakt' }).click();
  await page.getByRole('dialog').getByLabel('Firma').fill('Novák Studio s.r.o.');
  await page.getByRole('dialog').getByRole('button', { name: 'Uložit změny' }).click();
  await expect(page.getByText('Novák Studio s.r.o.').first()).toBeVisible();

  await page.locator('.workspace-switch').click();
  await page.getByRole('menuitem', { name: /4legs/ }).click();
  await openHub(page, 'kontakty/1');
  await expect(page.getByRole('heading', { name: 'Kontakt nenalezen' })).toBeVisible();
  await openHub(page, 'kontakty');
  await page.getByRole('textbox', { name: /Hledat jméno/ }).fill('adam benes');
  await expect(page.getByRole('cell').getByRole('button', { name: /^Adam Beneš/ })).toBeVisible();
  noErrors();
});

test('segment builder counts live and saves', async ({ page }) => {
  const noErrors = trackPageErrors(page);
  await openHub(page, 'kontakty/segmenty/novy');
  await page.getByLabel('Název segmentu').fill('Brno a okolí');
  await page.getByRole('combobox', { name: 'Pole pravidla 1' }).click();
  await page.getByRole('option', { name: 'Město' }).click();
  await page.getByRole('textbox', { name: 'Hodnota pravidla 1' }).fill('brno');
  const count = page.locator('.seg-count strong');
  await expect(count).not.toHaveText('0');
  const n = (await count.textContent())!.trim();
  await page.getByRole('button', { name: 'Vytvořit segment' }).click();
  await expect(page).toHaveURL(/#kontakty\/segmenty\/seg-/);
  await page.getByRole('button', { name: 'Zpět na segmenty' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Brno a okolí' })).toContainText(n);
  noErrors();
});

test('CSV import maps, validates and deduplicates', async ({ page }) => {
  const noErrors = trackPageErrors(page);
  await openHub(page, 'kontakty/import');
  await page.getByRole('button', { name: 'Načíst ukázková data' }).click();
  await page.getByRole('button', { name: 'Pokračovat' }).click();
  await page.getByRole('button', { name: 'Zkontrolovat data' }).click();
  await expect(page.locator('.import-stats > div').first()).toContainText('2');
  await expect(page.getByText('Řádek 4: Neplatný e-mail', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /^Importovat 2/ }).click();
  await expect(page.getByRole('heading', { name: 'Import je hotový' })).toBeVisible();
  await page.getByRole('button', { name: 'Zobrazit importované kontakty' }).click();
  await expect(page.getByRole('cell').getByRole('button', { name: /^Jana Ukázková/ })).toBeVisible();
  // the same file again creates nothing new
  await openHub(page, 'kontakty/import');
  await page.getByRole('button', { name: 'Načíst ukázková data' }).click();
  await page.getByRole('button', { name: 'Pokračovat' }).click();
  await page.getByRole('button', { name: 'Zkontrolovat data' }).click();
  await expect(page.locator('.import-stats > div').first()).toContainText('0');
  await expect(page.locator('.import-stats > div').nth(1)).toContainText('2');
  noErrors();
});

test('new campaign → recipients → block editor → schedule', async ({ page }) => {
  const noErrors = trackPageErrors(page);
  await openHub(page, 'kampane');
  await page.getByRole('button', { name: 'Nová kampaň' }).first().click();
  await expect(heading(page, 'Nová kampaň')).toBeVisible();
  await page.getByLabel('Název kampaně').fill('Testovací podzimní kampaň');
  await page.getByLabel('Předmět e-mailu').fill('{{jmeno}}, podzimní novinky');
  await page.getByRole('button', { name: 'Uložit a pokračovat' }).click();
  await expect(page).toHaveURL(/#kampane\/\d+\/upravit\?krok=2$/);

  await page.getByRole('button', { name: /Segment: VIP klienti/ }).click();
  const vip = (await page.locator('.audience-card.selected .count').textContent())!.trim();
  await expect(page.locator('.seg-count strong').first()).toHaveText(vip);
  await page.getByRole('button', { name: 'Pokračovat' }).click();

  await page.getByRole('button', { name: 'Přepnout editor' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Přepnout' }).click();
  await page.getByRole('button', { name: 'Otevřít editor' }).click();
  await expect(page.locator('.editor-canvas .email-block')).toHaveCount(7);
  await page.getByRole('button', { name: 'Blok Nadpis' }).click();
  await page.locator('.editor-properties textarea').fill('Nový nadpis z testu');
  await page.getByRole('button', { name: 'Zpět (undo)' }).click();
  await expect(page.locator('.editor-canvas .email-block.heading')).not.toHaveText('Nový nadpis z testu');
  await page.getByRole('button', { name: 'Znovu (redo)' }).click();
  await expect(page.locator('.editor-canvas .email-block.heading')).toHaveText('Nový nadpis z testu');
  await page.getByRole('button', { name: 'Hotovo' }).click();

  await expect(page.getByRole('heading', { name: 'Kontrola před odesláním' })).toBeVisible();
  await page.getByRole('button', { name: 'Odeslat nebo naplánovat' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Naplánovat odeslání' }).click();
  await expect(page).toHaveURL(/#kampane\/\d+$/);
  await openHub(page, 'kampane');
  await expect(page.getByRole('row').filter({ hasText: 'Testovací podzimní kampaň' })).toContainText('Naplánováno');
  noErrors();
});

test('pipeline moves a deal between stages', async ({ page }) => {
  const noErrors = trackPageErrors(page);
  await openHub(page, 'kontakty/pipeline');
  const won = page.locator('.kanban-col').filter({ has: page.getByRole('heading', { name: 'Vyhráno' }) });
  const before = await won.locator('.deal-card').count();
  await page.locator('.kanban-col').first().getByRole('button', { name: /^Akce obchodu/ }).first().click();
  await page.getByRole('menuitem', { name: 'Vyhráno' }).click();
  await expect(won.locator('.deal-card')).toHaveCount(before + 1);
  noErrors();
});

test('course structure: add module and lesson, edit and reorder', async ({ page }) => {
  const noErrors = trackPageErrors(page);
  await openHub(page, 'kurzy/c-email');
  await page.getByRole('button', { name: 'Přidat modul' }).click();
  await page.getByLabel('Název modulu').fill('Bonusy');
  await page.getByRole('button', { name: 'Uložit', exact: true }).click();
  const bonus = page.getByRole('region', { name: /Modul 3: Bonusy/ });
  await bonus.getByRole('button', { name: 'Přidat lekci' }).click();
  await expect(page).toHaveURL(/#kurzy\/c-email\/lekce\/l-/);
  await page.getByLabel('Název lekce').fill('Bonusová šablona');
  await page.getByRole('button', { name: 'Uložit lekci' }).click();
  await page.getByRole('button', { name: 'E-mailing, který prodává' }).click();
  await expect(bonus.getByRole('button', { name: /^Bonusová šablona/ })).toBeVisible();
  await bonus.getByRole('button', { name: 'Posunout modul nahoru' }).click();
  await expect(page.getByRole('region', { name: /Modul 2: Bonusy/ })).toBeVisible();
  // publish needs lessons → the draft course can be published now
  await page.getByRole('button', { name: 'Publikovat' }).click();
  await expect(page.getByText('Publikováno', { exact: true }).first()).toBeVisible();
  noErrors();
});

test('student preview marks lessons done and keeps progress', async ({ page }) => {
  const noErrors = trackPageErrors(page);
  await openHub(page, 'kurzy/c-marketing/nahled?student=1&lekce=l6');
  await expect(page.getByRole('heading', { level: 1, name: 'Kvíz: znáte své zákazníky?' })).toBeVisible();
  await expect(page.locator('.player-course small')).toContainText('5 z 12');
  await page.getByRole('button', { name: 'Označit jako dokončené' }).click();
  await expect(page.locator('.player-course small')).toContainText('6 z 12');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.player-course small')).toContainText('6 z 12');
  // visitors without access only see the free preview lesson
  await page.getByRole('combobox', { name: 'Zobrazit jako' }).click();
  await page.getByRole('option', { name: 'Návštěvník bez přístupu' }).click();
  await page.getByRole('button', { name: /Jak si stanovit cíle/ }).click();
  await expect(page.getByRole('heading', { name: 'Lekce je zamčená' })).toBeVisible();
  // the lesson shows up on the contact timeline
  await openHub(page, 'kontakty/1');
  await expect(page.getByText('Dokončena lekce Kvíz: znáte své zákazníky?')).toBeVisible();
  noErrors();
});

test('webinar registration creates one contact and no duplicates', async ({ page }) => {
  const noErrors = trackPageErrors(page);
  await openHub(page, 'webinare/w-ai/stranka');
  await page.getByLabel('Jméno a příjmení').fill('Zuzana Testovací');
  await page.getByLabel('E-mail', { exact: true }).fill('zuzana.testovaci@posta.example');
  await page.getByRole('button', { name: 'Registrovat se zdarma' }).click();
  await expect(page.getByRole('heading', { name: 'Registrace je potvrzená' })).toBeVisible();
  await page.getByRole('button', { name: 'Registrovat další osobu' }).click();
  await page.getByLabel('Jméno a příjmení').fill('Zuzana Testovací');
  await page.getByLabel('E-mail', { exact: true }).fill('Zuzana.Testovaci@posta.example');
  await page.getByRole('button', { name: 'Registrovat se zdarma' }).click();
  await expect(page.getByRole('heading', { name: 'Už jste registrovaní' })).toBeVisible();

  await openHub(page, 'kontakty?q=zuzana');
  await expect(page.getByRole('cell').getByRole('button', { name: /^Zuzana Testovací/ })).toHaveCount(1);
  await page.getByRole('cell').getByRole('button', { name: /^Zuzana Testovací/ }).click();
  await expect(page.getByText('Registrace na webinář').first()).toBeVisible();
  noErrors();
});

test('cancelled webinar closes its registration page', async ({ page }) => {
  const noErrors = trackPageErrors(page);
  await openHub(page, 'webinare/w-mail');
  await page.getByRole('button', { name: /^Akce webináře/ }).click();
  await page.getByRole('menuitem', { name: 'Zrušit webinář' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Zrušit webinář' }).click();
  await expect(page.getByText('Zrušeno', { exact: true }).first()).toBeVisible();
  await openHub(page, 'webinare/w-mail/stranka');
  await expect(page.getByRole('heading', { name: 'Webinář byl zrušen' })).toBeVisible();
  noErrors();
});

test('automation: template → activate → CRM tag enrols → insert step with validation', async ({ page }) => {
  const noErrors = trackPageErrors(page);
  await openHub(page, 'automatizace');
  await page.getByRole('button', { name: 'Nový scénář' }).first().click();
  await page.getByLabel('Název scénáře').fill('Testovací přivítání');
  await page.getByRole('button', { name: 'Vytvořit scénář' }).click();
  await expect(heading(page, 'Testovací přivítání')).toBeVisible();
  await expect(page.locator('.fnode')).toHaveCount(6);
  await page.getByRole('button', { name: 'Aktivovat' }).click();
  await expect(page.getByText('Aktivní', { exact: true }).first()).toBeVisible();
  const url = page.url();

  // a tag added in the CRM fires the trigger
  await openHub(page, 'kontakty/10');
  await page.getByRole('button', { name: '+ Přidat', exact: true }).click();
  await page.getByRole('combobox', { name: 'Nový štítek' }).fill('Newsletter');
  await page.getByRole('button', { name: 'Přidat', exact: true }).click();
  await expect(page.getByText('Vstup do automatizace Testovací přivítání')).toBeVisible();

  // insert a step on an edge; the empty step blocks saving an active workflow until it is filled in
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Vložit krok sem' }).first().click();
  await page.getByRole('menuitem', { name: 'Notifikace týmu' }).click();
  await expect(page.getByRole('button', { name: /1 chyba/ })).toBeVisible();
  await page.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.locator('.flow-issues')).toContainText('vyplňte příjemce');
  await page.locator('.flow-side').getByLabel('Komu').fill('tym@softema.example');
  await expect(page.getByRole('button', { name: 'Bez chyb' })).toBeVisible();
  await page.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.locator('.fnode')).toHaveCount(7);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.fnode')).toHaveCount(7);
  noErrors();
});

test('invoice: create → send → pay shows on the contact and in transactions', async ({ page }) => {
  const noErrors = trackPageErrors(page);
  await openHub(page, 'kontakty/1');
  await page.getByRole('tab', { name: /^Platby/ }).click();
  await page.getByRole('button', { name: 'Nová faktura' }).click();
  await expect(heading(page, 'Nová faktura')).toBeVisible();
  await page.getByRole('button', { name: 'Uložit a odeslat' }).click();
  await expect(page.locator('.form-error')).toContainText('Každá položka potřebuje název');
  await page.getByLabel('Název položky 1').fill('Audit kampaní');
  await page.getByLabel('Cena položky 1').fill('7400');
  await page.getByRole('button', { name: 'Uložit a odeslat' }).click();
  await expect(page.getByText('Odeslaná', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Označit jako zaplacenou' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Označit jako zaplacenou' }).click();
  await expect(page.getByText('Zaplacená', { exact: true }).first()).toBeVisible();

  await openHub(page, 'platby/transakce?q=audit');
  await expect(page.getByRole('row').filter({ hasText: 'Audit kampaní' })).toContainText('Úspěšná');
  await openHub(page, 'kontakty/1');
  await expect(page.getByText(/^Zaplacena faktura \d+/).first()).toBeVisible();
  noErrors();
});

test('community: post, moderate and check access', async ({ page }) => {
  const noErrors = trackPageErrors(page);
  await openHub(page, 'komunita/g-club');
  await page.getByLabel('Nový příspěvek').fill('Testovací příspěvek pro členy klubu');
  await page.getByRole('button', { name: 'Zveřejnit' }).click();
  await expect(page.locator('.post').filter({ hasText: 'Testovací příspěvek pro členy klubu' })).toHaveCount(1);

  await openHub(page, 'komunita/moderace');
  await page.getByRole('button', { name: 'Skrýt příspěvek' }).click();
  await expect(page.getByText('Vyřešeno', { exact: true })).toBeVisible();
  await expect(page.getByText('Žádné otevřené nahlášení', { exact: false })).toBeVisible();

  // a visitor does not get into the paid group
  await openHub(page, 'komunita/g-club/pristup');
  await expect(page.getByText('Nemá přístup: Nepřihlášený návštěvník')).toBeVisible();
  await expect(page.getByRole('button', { name: /Koupit členství/ })).toBeVisible();
  noErrors();
});

test('chatbot answers from the knowledge base and saves a lead to CRM', async ({ page }) => {
  const noErrors = trackPageErrors(page);
  await openHub(page, 'chatbot');
  const chat = page.locator('.chat-widget');
  const say = async (t: string) => { await chat.getByLabel('Zpráva pro chatbota').fill(t); await chat.getByRole('button', { name: 'Odeslat' }).click(); };
  await say('Kolik stojí konzultace?');
  await expect(chat.locator('.chat-message').nth(2)).toContainText('2 900 Kč');
  await say('Jana Chatová');
  await say('jana.chatova@posta.example');
  await expect(chat).toContainText('kolegové se vám brzy ozvou');
  await openHub(page, 'kontakty?q=chatova');
  await expect(page.getByRole('cell').getByRole('button', { name: /^Jana Chatová/ })).toBeVisible();
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
