// Database version end to end: real sign-in, API and PostgreSQL. Only fictional seed data.
import { createHash, createHmac } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, expect, type Page, test } from '@playwright/test';

const PASSWORD = process.env.SEED_USER_PASSWORD!;
const MANAGER = 'spravce@softema-hub.example', MEMBER = 'clen@softema-hub.example', OUTSIDER = 'cizi@softema-hub.example', AGENCY = 'agentura@softema-hub.example';
const WS_A = '20000000-0000-4000-8000-00000000000a';
let n = 0;
const unique = () => `e2e-${Date.now().toString(36)}-${++n}@test-firma.example`;

/* 2FA of the seed administrators. Same derivation as packages/db/src/seed-auth.ts (this package cannot import it). */
const SEED_TOTP = createHash('sha256').update(`softema-hub-seed-totp:${PASSWORD}`).digest('base64url').slice(0, 32);
const ADMINS = new Set([MANAGER, OUTSIDER, AGENCY]);
function totp(secret: string) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const h = createHmac('sha1', Buffer.from(secret, 'utf8')).update(counter).digest();
  return String((h.readUInt32BE(h[h.length - 1] & 15) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
/** The key an authenticator app gets (base32), back to the raw secret. */
function fromBase32(key: string) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, value = 0; const out: number[] = [];
  for (const ch of key.replace(/\s/g, '')) { value = (value << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out).toString('utf8');
}
/** The newest e-mail for `to` in the local outbox of this run, as the one-time link it contains. */
async function mailLink(to: string, path: '/pozvanka' | '/nove-heslo') {
  const dir = process.env.E2E_OUTBOX!;
  let link: string | undefined;
  await expect.poll(() => {
    const files = readdirSync(dir).map(f => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    const html = files.map(f => readFileSync(f, 'utf8')).find(h => h.includes(to) && h.includes(path));
    link = html?.match(new RegExp(`href="(https?://[^"]*${path}#[A-Za-z0-9_-]+)"`))?.[1];
    return link;
  }, { timeout: 10_000 }).toBeTruthy();
  return link!.replace(/^https?:\/\/[^/]+/, '');
}

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/prihlaseni');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Heslo', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Přihlásit se', exact: true }).click();
  if (ADMINS.has(email)) {
    await page.getByLabel('Ověřovací kód').fill(totp(SEED_TOTP));
    await page.getByRole('button', { name: 'Ověřit a přihlásit' }).click();
  }
}
async function session(browser: Browser, email: string, info: { project: { use: object } }) {
  const ctx = await browser.newContext({ ...info.project.use, baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await login(page, email);
  await expect(page.getByRole('heading', { level: 1, name: 'Kontakty' })).toBeVisible();
  return page;
}
async function createContact(page: Page, name: string, email = unique()) {
  await page.getByRole('button', { name: 'Nový kontakt' }).first().click();
  await page.getByPlaceholder('Např. Jana Novotná').fill(name);
  await page.getByPlaceholder('jana@firma.cz').fill(email);
  await page.getByRole('button', { name: 'Vytvořit kontakt' }).click();
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  return { id: page.url().split('kontakty/')[1], email };
}

test('bez přihlášení se aplikace neotevře', async ({ page }) => {
  await page.goto('/aplikace#kontakty');
  await expect(page).toHaveURL(/\/prihlaseni/);
  const api = await page.request.get(`/api/v1/workspaces/${WS_A}/contacts`);
  expect(api.status()).toBe(401);
});

test('špatné heslo ukáže chybu a nepustí dál; registrace je vypnutá', async ({ page }) => {
  await login(page, MEMBER, 'spatne-heslo-123456');
  await expect(page.locator('.a-error')).toHaveText('Nesprávný e-mail nebo heslo.');
  await expect(page).toHaveURL(/\/prihlaseni/);
  await page.goto('/registrace');
  await expect(page).toHaveURL(/\/prihlaseni/);
});

test('přihlášení, seznam s hledáním bez diakritiky, detail a odhlášení', async ({ page }, info) => {
  await login(page, MEMBER);
  await expect(page.getByRole('heading', { level: 1, name: 'Kontakty' })).toBeVisible();
  await page.getByLabel('Hledat jméno, e-mail, firmu, město…').fill('stastny');
  await page.getByRole('button', { name: /^Jiří Šťastný/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Jiří Šťastný' })).toBeVisible();
  await expect(page.getByText('jiri.stastny@posta.example')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: 'Jiří Šťastný' })).toBeVisible();
  if (!info.project.use.isMobile) {
    await page.locator('.sidebar-bottom .profile').click();
    await page.getByRole('menuitem', { name: 'Odhlásit se' }).click();
    await expect(page).toHaveURL(/\/prihlaseni/);
    await page.goto('/aplikace');
    await expect(page).toHaveURL(/\/prihlaseni/);
  }
});

test('dva členové sdílejí kontakt, štítky i poznámky', async ({ browser }, info) => {
  const manager = await session(browser, MANAGER, info), member = await session(browser, MEMBER, info);
  const name = `Sdílený ${Date.now().toString(36)}`;
  const { id } = await createContact(manager, name);
  await manager.getByRole('button', { name: '+ Přidat' }).click();
  await manager.getByPlaceholder('Hledat nebo napsat nový…').fill('E2E štítek');
  await manager.getByRole('option', { name: /Vytvořit|E2E štítek/ }).first().click();
  await expect(manager.locator('.tag-chip', { hasText: 'E2E štítek' })).toBeVisible();

  await member.goto(`/aplikace#kontakty/${id}`);
  await expect(member.getByRole('heading', { level: 2, name })).toBeVisible();
  await expect(member.locator('.tag-chip', { hasText: 'E2E štítek' })).toBeVisible();
  await member.getByRole('tab', { name: /Poznámky/ }).click();
  await member.getByLabel('Nová interní poznámka').fill('Poznámka od členky týmu');
  await member.getByRole('button', { name: 'Přidat poznámku' }).click();
  await expect(member.getByText('Poznámka od členky týmu')).toBeVisible();

  await manager.reload();
  await manager.getByRole('tab', { name: /Poznámky/ }).click();
  await expect(manager.getByText('Poznámka od členky týmu')).toBeVisible();
  await expect(manager.getByText('Marta Členová', { exact: false }).first()).toBeVisible();
  await manager.getByRole('tab', { name: 'Časová osa' }).click();
  await expect(manager.getByRole('heading', { name: 'Přidána interní poznámka' })).toBeVisible();
  await expect(manager.getByRole('heading', { name: 'Přidán štítek E2E štítek' })).toBeVisible();
  await manager.context().close(); await member.context().close();
});

test('mazat smí jen správce; smazaný kontakt zmizí všem', async ({ browser }, info) => {
  const manager = await session(browser, MANAGER, info), member = await session(browser, MEMBER, info);
  const name = `Ke smazání ${Date.now().toString(36)}`;
  const { id } = await createContact(member, name);
  await expect(member.getByRole('button', { name: 'Smazat kontakt' })).toHaveCount(0);
  const direct = await member.evaluate(u => fetch(u, { method: 'DELETE' }).then(r => r.status), `/api/v1/workspaces/${WS_A}/contacts/${id}`);
  expect(direct).toBe(403);
  await manager.goto(`/aplikace#kontakty/${id}`);
  await manager.getByRole('button', { name: 'Smazat kontakt' }).click();
  await manager.getByRole('dialog').getByRole('button', { name: 'Smazat kontakt' }).click();
  await expect(manager.getByRole('heading', { level: 1, name: 'Kontakty' })).toBeVisible();
  await member.reload();
  await expect(member.getByRole('heading', { name: 'Kontakt nenalezen' })).toBeVisible();
  await manager.context().close(); await member.context().close();
});

test('člen cizího prostoru se k datům nedostane ani přímým odkazem a voláním API', async ({ browser }, info) => {
  const manager = await session(browser, MANAGER, info);
  const { id, email } = await createContact(manager, `Tajný ${Date.now().toString(36)}`);
  const outsider = await session(browser, OUTSIDER, info);
  await expect(outsider.getByRole('button', { name: /Hana Betová/ })).toBeVisible();
  await expect(outsider.getByText('Prostor Alfa')).toHaveCount(0);
  await outsider.goto(`/aplikace#kontakty/${id}`);
  await expect(outsider.getByRole('heading', { name: 'Kontakt nenalezen' })).toBeVisible();
  const statuses = await outsider.evaluate(async ({ ws, contact }) => {
    const base = `/api/v1/workspaces/${ws}/contacts`;
    const json = { 'content-type': 'application/json' };
    return Promise.all([
      fetch(base), fetch(`${base}/${contact}`),
      fetch(`${base}/${contact}`, { method: 'PATCH', headers: json, body: JSON.stringify({ version: 1, name: 'Hack' }) }),
      fetch(`${base}/${contact}`, { method: 'DELETE' }),
    ].map(p => p.then(r => r.status)));
  }, { ws: WS_A, contact: id });
  expect(statuses).toEqual([404, 404, 404, 404]);
  await manager.reload();
  await expect(manager.getByText(email)).toBeVisible();
  await manager.context().close(); await outsider.context().close();
});

test('správce agentury přepíná mezi prostory a vidí jen data vybraného', async ({ browser }, info) => {
  test.skip(!!info.project.use.isMobile, 'přepínač je v postranním panelu');
  const page = await session(browser, AGENCY, info);
  await page.locator('.workspace-switch').click();
  await page.getByRole('menuitem', { name: 'Prostor Beta' }).click();
  await expect(page.getByRole('button', { name: /Hana Betová/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Jiří Šťastný/ })).toHaveCount(0);
  await page.locator('.workspace-switch').click();
  await page.getByRole('menuitem', { name: 'Prostor Alfa' }).click();
  await expect(page.getByRole('button', { name: /Jiří Šťastný/ })).toBeVisible();
  await page.context().close();
});

test('duplicitní e-mail: dialog zůstane otevřený, žádné potvrzení úspěchu', async ({ page }) => {
  await login(page, MANAGER);
  await page.getByRole('button', { name: 'Nový kontakt' }).first().click();
  await page.getByPlaceholder('Např. Jana Novotná').fill('Duplicitní');
  await page.getByPlaceholder('jana@firma.cz').fill('JIRI.STASTNY@posta.example');
  await page.getByRole('button', { name: 'Vytvořit kontakt' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('už v prostoru existuje');
  await expect(page.getByPlaceholder('Např. Jana Novotná')).toHaveValue('Duplicitní');
  await expect(page.getByText('Kontakt byl vytvořen.')).toHaveCount(0);
});

test('selhání serveru při ukládání: bez falešného potvrzení, formulář se neztratí, opakování uspěje', async ({ page }) => {
  await login(page, MANAGER);
  await expect(page.getByRole('heading', { level: 1, name: 'Kontakty' })).toBeVisible();
  const url = `**/api/v1/workspaces/${WS_A}/contacts`;
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  await page.route(url, async route => { if (route.request().method() !== 'POST') return route.continue(); await gate; await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'INTERNAL', message: 'Něco se nepovedlo. Změna se neuložila.' }) }); });
  await page.getByRole('button', { name: 'Nový kontakt' }).first().click();
  await page.getByPlaceholder('Např. Jana Novotná').fill('Rozepsaný kontakt');
  const email = unique();
  await page.getByPlaceholder('jana@firma.cz').fill(email);
  await page.getByRole('button', { name: 'Vytvořit kontakt' }).click();
  await expect(page.getByRole('button', { name: 'Ukládám…' })).toBeDisabled();
  release();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Něco se nepovedlo. Změna se neuložila.');
  await expect(page.getByText('Kontakt byl vytvořen.')).toHaveCount(0);
  await expect(page.getByPlaceholder('jana@firma.cz')).toHaveValue(email);
  await page.unroute(url);
  await page.getByRole('button', { name: 'Vytvořit kontakt' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Rozepsaný kontakt' })).toBeVisible();
  await expect(page.getByText('Kontakt byl vytvořen.')).toBeVisible();
});

test('výpadek serveru při načítání: chyba s možností opakovat', async ({ page }) => {
  await login(page, MANAGER);
  await expect(page.getByRole('heading', { level: 1, name: 'Kontakty' })).toBeVisible();
  await page.route('**/api/v1/**/contacts*', r => r.abort());
  await page.goto('about:blank');
  await page.goto('/aplikace#kontakty');
  const failure = page.locator('section[role=alert]');
  await expect(failure).toContainText('Data se nepodařilo načíst', { timeout: 20_000 });
  await expect(failure).not.toContainText('neuložila');
  await page.unroute('**/api/v1/**/contacts*');
  await page.getByRole('button', { name: 'Zkusit znovu' }).click();
  await expect(failure).toHaveCount(0);
  await expect(page.locator('.data-table tbody tr').first()).toBeVisible();
});

test('současná úprava: druhý dostane konflikt a načte aktuální data', async ({ browser }, info) => {
  const a = await session(browser, MANAGER, info), b = await session(browser, MEMBER, info);
  const { id } = await createContact(a, `Konflikt ${Date.now().toString(36)}`);
  await b.goto(`/aplikace#kontakty/${id}`);
  await b.getByRole('button', { name: 'Upravit kontakt' }).click();
  await b.getByLabel('Město').fill('Praha');
  await a.getByRole('button', { name: 'Upravit kontakt' }).click();
  await a.getByLabel('Město').fill('Brno');
  await a.getByRole('button', { name: 'Uložit změny' }).click();
  await expect(a.getByText('Kontakt byl uložen.')).toBeVisible();
  await b.getByRole('button', { name: 'Uložit změny' }).click();
  await expect(b.getByText('Kontakt mezitím upravil někdo jiný')).toBeVisible();
  await expect(b.getByText('Kontakt byl uložen.')).toHaveCount(0);
  await b.getByRole('button', { name: 'Načíst aktuální data' }).click();
  await expect(b.getByLabel('Město')).toHaveValue('Brno');
  await a.context().close(); await b.context().close();
});

test('správce se samotným heslem nepřihlásí; kód z aplikace ano', async ({ page }) => {
  await page.goto('/prihlaseni');
  await page.getByLabel('E-mail').fill(MANAGER);
  await page.getByLabel('Heslo', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Přihlásit se', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ověření ve dvou krocích' })).toBeVisible();
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  await page.getByLabel('Ověřovací kód').fill('000000');
  await page.getByRole('button', { name: 'Ověřit a přihlásit' }).click();
  await expect(page.locator('.a-error')).toContainText('Kód není platný');
  await page.getByLabel('Ověřovací kód').fill(totp(SEED_TOTP));
  await page.getByRole('button', { name: 'Ověřit a přihlásit' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Kontakty' })).toBeVisible();
});

test('pozvánka: nový správce si založí účet, zapne 2FA; správce mu změní roli a odebere ho', async ({ browser }, info) => {
  test.skip(!!info.project.use.isMobile, 'dlouhý scénář stačí jednou; obrazovky jsou na mobilu stejné');
  const manager = await session(browser, MANAGER, info);
  const email = unique();
  await manager.goto('/aplikace#tym');
  await expect(manager.getByRole('heading', { level: 1, name: 'Tým' })).toBeVisible();
  await manager.getByRole('button', { name: 'Pozvat člena' }).first().click();
  const dialog = manager.getByRole('dialog');
  await dialog.getByLabel('E-mail').fill(email);
  await dialog.getByRole('combobox', { name: 'Role' }).click();
  await manager.getByRole('option', { name: 'Správce prostoru' }).click();
  await dialog.getByRole('button', { name: 'Poslat pozvánku' }).click();
  await expect(manager.getByText(`Pozvánka pro ${email} je připravená.`)).toBeVisible();
  await expect(manager.getByRole('region', { name: 'Čekající pozvánky' }).getByText(email)).toBeVisible();

  const ctx = await browser.newContext({ ...info.project.use, baseURL: test.info().project.use.baseURL });
  const guest = await ctx.newPage();
  await guest.goto(await mailLink(email, '/pozvanka'));
  await expect(guest.getByRole('heading', { level: 1, name: 'Připojte se k prostoru Prostor Alfa.' })).toBeVisible();
  expect(guest.url()).not.toContain('#');
  const password = 'Nove-heslo-pozvaneho-2026';
  await guest.getByLabel('Jméno a příjmení').fill('Nela Nováčková');
  await guest.getByLabel('Nové heslo').fill(password);
  await guest.getByLabel('Heslo znovu').fill(password);
  await guest.getByRole('button', { name: 'Založit účet a přijmout' }).click();

  // Administrators must turn on 2FA before they see any data.
  await expect(guest.getByRole('heading', { name: 'Zapněte si dvoufázové ověření' })).toBeVisible();
  expect((await guest.request.get(`/api/v1/workspaces/${WS_A}/contacts`)).status()).toBe(403);
  await guest.getByLabel('Současné heslo').fill(password);
  await guest.getByRole('button', { name: 'Pokračovat' }).click();
  await expect(guest.getByRole('img', { name: 'QR kód pro autentizační aplikaci' })).toBeVisible();
  const key = await guest.getByLabel('Klíč pro autentizační aplikaci').innerText();
  await guest.getByLabel('Ověřovací kód').fill(totp(fromBase32(key)));
  await guest.getByRole('button', { name: 'Zapnout ověření' }).click();
  await expect(guest.getByRole('list', { name: 'Záložní kódy' }).getByRole('listitem')).toHaveCount(10);
  await guest.getByRole('button', { name: 'Kódy mám uložené, pokračovat' }).click();
  await expect(guest.getByRole('heading', { level: 1, name: 'Kontakty' })).toBeVisible();

  await manager.reload();
  const row = manager.getByRole('row', { name: new RegExp(email) });
  await expect(row.getByText('Zapnuto')).toBeVisible();
  await row.getByRole('combobox', { name: 'Role: Nela Nováčková' }).click();
  await manager.getByRole('option', { name: 'Člen týmu' }).click();
  await expect(manager.getByText('Nela Nováčková má nyní roli Člen týmu.')).toBeVisible();
  await row.getByRole('button', { name: 'Odebrat Nela Nováčková' }).click();
  await manager.getByRole('dialog').getByRole('button', { name: 'Odebrat z prostoru' }).click();
  await expect(manager.getByRole('row', { name: new RegExp(email) })).toHaveCount(0);

  await guest.reload();
  await expect(guest.getByRole('heading', { name: 'Nemáte přístup k žádnému prostoru' })).toBeVisible();
  await guest.goto(await mailLink(email, '/pozvanka'));
  await expect(guest.getByRole('heading', { name: 'Pozvánka už neplatí.' })).toBeVisible();
  await manager.context().close(); await ctx.close();
});

test('člen vidí tým, ale nespravuje ho', async ({ page }) => {
  await login(page, MEMBER);
  await expect(page.getByRole('heading', { level: 1, name: 'Kontakty' })).toBeVisible();
  await page.goto('/aplikace#tym');
  await expect(page.getByRole('row', { name: /Petr Správce/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pozvat člena' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: /^Role:/ })).toHaveCount(0);
  await expect(page.getByText('Čekající pozvánky')).toHaveCount(0);
});

test('zapomenuté heslo: odkaz z e-mailu nastaví nové heslo a platí jen jednou', async ({ page }, info) => {
  test.skip(!!info.project.use.isMobile, 'mění heslo sdíleného testovacího účtu; stačí jednou');
  const reset = async (password: string) => {
    await page.goto('/prihlaseni');
    await page.getByRole('link', { name: 'Zapomněli jste heslo?' }).click();
    await page.getByLabel('E-mail').fill(MEMBER);
    await page.getByRole('button', { name: 'Poslat odkaz' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Zkontrolujte svůj e-mail.' })).toBeVisible();
    const link = await mailLink(MEMBER, '/nove-heslo');
    await page.goto(link);
    await page.getByLabel('Nové heslo').fill(password);
    await page.getByLabel('Heslo znovu').fill(password);
    await page.getByRole('button', { name: 'Uložit nové heslo' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Heslo je změněné.' })).toBeVisible();
    return link;
  };
  const used = await reset('Docasne-heslo-e2e-2026');
  await login(page, MEMBER);
  await expect(page.locator('.a-error')).toHaveText('Nesprávný e-mail nebo heslo.');
  await login(page, MEMBER, 'Docasne-heslo-e2e-2026');
  await expect(page.getByRole('heading', { level: 1, name: 'Kontakty' })).toBeVisible();
  await page.goto(used);
  await page.getByLabel('Nové heslo').fill('Jeste-jine-heslo-2026');
  await page.getByLabel('Heslo znovu').fill('Jeste-jine-heslo-2026');
  await page.getByRole('button', { name: 'Uložit nové heslo' }).click();
  await expect(page.locator('.a-error')).toContainText('neplatný');
  await reset(PASSWORD); // other tests use the seed password
});