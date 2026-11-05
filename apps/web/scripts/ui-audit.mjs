// UI audit: opens every Hub screen (both workspaces) at several widths in light and dark theme and reports
// uncaught errors, console errors, horizontal overflow and axe-core violations (contrast, names, labels).
// Optional screenshots for a handover. Needs a running app (pnpm dev or pnpm start).
//
//   node scripts/ui-audit.mjs [--base http://localhost:3000] [--widths 1920,1440,1024,390] [--themes light,dark]
//                             [--shots docs/screenshots] [--shot-widths 1440,390] [--shot-filter '^(prehled|kontakty)$'] [--only kontakty]
//
// Output: a JSON report in test-results/ui-audit.json and a short summary on stdout. Exit code 1 on findings.
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? 'true' : all[i + 1] ?? 'true']] : acc), []));
const BASE = args.base ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const WIDTHS = (args.widths ?? '1920,1440,1024,390').split(',').map(Number);
const THEMES = (args.themes ?? 'light,dark').split(',');
const SHOTS = args.shots;
const SHOT_WIDTHS = new Set((args['shot-widths'] ?? '1440,390').split(',').map(Number));
const ONLY = args.only;
// Screenshots only for routes matching this regular expression (all when omitted).
const SHOT_FILTER = args['shot-filter'] ? new RegExp(args['shot-filter']) : null;
const WORKSPACES = ['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002'];
// Rules that need a backend or are false positives for this layout.
const AXE_DISABLED = ['region', 'landmark-unique', 'landmark-one-main', 'page-has-heading-one', 'scrollable-region-focusable'];

/** Hub routes derived from the stored demo data of the active workspace. */
function routesFor(d, ws) {
  const mine = list => list.filter(x => x.workspaceId === ws);
  const contact = mine(d.contacts)[0], seg = mine(d.segments)[0], camp = mine(d.campaigns), wf = mine(d.workflows)[0];
  const inv = mine(d.invoices)[0], course = mine(d.courses)[0], prod = mine(d.products)[0], g = mine(d.groups)[0], web = mine(d.webinars)[0];
  const lesson = course?.modules.flatMap(m => m.lessons)[0];
  const sent = camp.find(c => c.status === 'Odesláno'), draft = camp.find(c => c.status === 'Koncept') ?? camp[0];
  return [
    'prehled',
    'kontakty', contact && `kontakty/${contact.id}`, 'kontakty/segmenty', seg && `kontakty/segmenty/${seg.id}`, 'kontakty/segmenty/novy', 'kontakty/pipeline', 'kontakty/souhlasy', 'kontakty/import',
    'kampane', 'kampane/nova', draft && `kampane/${draft.id}/upravit`, draft && `kampane/${draft.id}/upravit?krok=2`, draft && `kampane/${draft.id}/upravit?krok=3`, draft && `kampane/${draft.id}/upravit?krok=4`, draft && `kampane/${draft.id}/editor`, sent && `kampane/${sent.id}`,
    'automatizace', wf && `automatizace/${wf.id}`,
    'platby', 'platby/faktury', inv && `platby/faktury/${inv.id}`, 'platby/transakce', 'platby/predplatne', 'platby/odkazy', 'platby/kupony',
    'kurzy', course && `kurzy/${course.id}`, course && `kurzy/${course.id}/nastaveni`, course && `kurzy/${course.id}/studenti`, course && lesson && `kurzy/${course.id}/lekce/${lesson.id}`, course && `kurzy/${course.id}/nahled`,
    'kurzy/produkty', prod && `kurzy/produkty/${prod.id}`,
    'komunita', 'komunita/moderace', g && `komunita/${g.id}`, g && `komunita/${g.id}/clenove`, g && `komunita/${g.id}/nastaveni`, g && `komunita/${g.id}/pristup`,
    'webinare', web && `webinare/${web.id}`, web && `webinare/${web.id}/registrace`, web && `webinare/${web.id}/upravit`, web && `webinare/${web.id}/pripominky`, web && `webinare/${web.id}/stranka`, web && `webinare/${web.id}/mistnost`,
    'chatbot', 'chatbot/znalosti', 'chatbot/chovani', 'chatbot/instalace',
    'nastaveni/profil', 'nastaveni/prostor', 'nastaveni/branding', 'nastaveni/tym', 'nastaveni/domeny', 'nastaveni/integrace', 'nastaveni/notifikace', 'nastaveni/data',
  ].filter(Boolean).filter(r => !ONLY || r.startsWith(ONLY));
}

/** Elements sticking out of the viewport that are not inside a horizontally scrollable container. */
const overflowProbe = () => {
  const vw = document.documentElement.clientWidth;
  const scrolls = el => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && p !== document.body && p !== document.documentElement) return true; } return false; };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || r.right <= vw + 1 || getComputedStyle(el).position === 'fixed' || scrolls(el)) continue;
    out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} → ${Math.round(r.right - vw)}px`);
    if (out.length > 4) break;
  }
  return { page: document.documentElement.scrollWidth - vw, items: out };
};

const report = [];
const browser = await chromium.launch();
const slug = r => r.replace(/[/?=]/g, '_');
for (const theme of THEMES) for (const width of WIDTHS) for (const ws of WORKSPACES) {
  const mobile = width < 768;
  const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, colorScheme: theme, locale: 'cs-CZ', timezoneId: 'Europe/Prague', reducedMotion: 'reduce', isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  let errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/editor\.unlayer\.com|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(`${BASE}/aplikace`);
  await page.evaluate(w => localStorage.setItem('softema-hub:workspace', w), ws);
  await page.reload({ waitUntil: 'networkidle' });
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('softema-hub:data')).data);
  for (const route of routesFor(data, ws)) {
    errors = [];
    await page.goto(`${BASE}/aplikace#${route}`);
    await page.reload({ waitUntil: 'networkidle' }); // direct link / refresh behaviour
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.waitForTimeout(250);
    const h1 = await page.locator('h1').first().textContent({ timeout: 3000 }).catch(() => null);
    const overflow = await page.evaluate(overflowProbe);
    const axe = await new AxeBuilder({ page }).disableRules(AXE_DISABLED).exclude('.email-paper').exclude('.chat-widget').exclude('iframe').analyze().catch(e => ({ violations: [{ id: 'axe-failed', impact: 'n/a', nodes: [{ target: [String(e).slice(0, 80)] }] }] }));
    const violations = axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => ({ id: v.id, n: v.nodes.length, targets: v.nodes.slice(0, 3).map(n => n.target.join(' ')) }));
    const item = { theme, width, ws: ws.slice(-1), route, h1, errors: [...errors], overflow: overflow.page > 1 || overflow.items.length ? overflow : undefined, violations: violations.length ? violations : undefined };
    report.push(item);
    if (SHOTS && SHOT_WIDTHS.has(width) && ws === WORKSPACES[0] && (!SHOT_FILTER || SHOT_FILTER.test(route))) {
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: join(SHOTS, `${width}-${theme}-${slug(route)}.jpg`), type: 'jpeg', quality: 70 });
    }
    const bad = item.errors.length || item.overflow || item.violations || !h1;
    process.stdout.write(bad ? 'x' : '.');
  }
  await ctx.close();
}
await browser.close();
mkdirSync('test-results', { recursive: true });
writeFileSync('test-results/ui-audit.json', JSON.stringify(report, null, 1));
const findings = report.filter(r => r.errors.length || r.overflow || r.violations || !r.h1);
console.log(`\n${report.length} screens checked, ${findings.length} with findings (test-results/ui-audit.json)`);
const byKey = new Map();
for (const f of findings) for (const k of [...f.errors.map(e => 'error ' + e), ...(f.overflow ? [`overflow ${f.overflow.items[0] ?? f.overflow.page + 'px'}`] : []), ...(f.violations ?? []).map(v => `axe ${v.id} ${v.targets[0]}`), ...(!f.h1 ? ['no h1'] : [])]) {
  const e = byKey.get(k) ?? []; e.push(`${f.theme}/${f.width}/ws${f.ws} ${f.route}`); byKey.set(k, e);
}
for (const [k, where] of [...byKey].sort((a, b) => b[1].length - a[1].length)) console.log(`- ${k}\n    ${where.length}× e.g. ${where.slice(0, 3).join(' | ')}`);
process.exitCode = findings.length ? 1 : 0;
