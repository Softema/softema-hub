/**
 * Deterministic demo data (fictional people and companies only). Generated once, at the first
 * start in a browser, relative to that moment; afterwards the store keeps the user's data.
 * Generated e-mail addresses use the reserved `.example` TLD.
 */
import { demoWorkspaces } from '../domain/tenancy';
import type {
  Activity, Campaign, ChatbotConfig, CommunityGroup, Contact, Consent, ConsentState, Coupon, Course, CourseModule, Deal, DealStage,
  DigitalProduct, Enrollment, HubData, Invoice, Lesson, Lifecycle, Membership, PaymentLink, Post, Purchase, Registration,
  Segment, Subscription, Transaction, UserProfile, Webinar, Workflow, WorkspaceSettings, Block,
} from './types';

export const WS_SOFTEMA = demoWorkspaces[0].id;
export const WS_4LEGS = demoWorkspaces[1].id;

/* ---------- deterministic helpers ---------- */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
type Rand = () => number;
const pick = <T,>(r: Rand, list: readonly T[]) => list[Math.floor(r() * list.length)];
const int = (r: Rand, min: number, max: number) => min + Math.floor(r() * (max - min + 1));
const chance = (r: Rand, p: number) => r() < p;
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function seedClock(now: Date) {
  const at = (days: number, hour = 10, minute = 0) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(hour, minute, 0, 0); return d.toISOString(); };
  // "ago" never returns a future instant: today's times later than now move a few minutes/hours back.
  const ago = (days: number, hour?: number, minute?: number) => {
    const t = at(-days, hour, minute);
    return +new Date(t) <= +now ? t : new Date(+now - ((((hour ?? 10) * 60 + (minute ?? 0)) % 170) + 7) * 60_000).toISOString();
  };
  return { at, ago };
}

/* ---------- name pools (fictional combinations) ---------- */
const MALE = ['Jan', 'Petr', 'Tomáš', 'Martin', 'Pavel', 'Jakub', 'Lukáš', 'Ondřej', 'David', 'Michal', 'Filip', 'Vojtěch', 'Adam', 'Matěj', 'Jiří', 'Marek', 'Radek', 'Daniel', 'Roman', 'Šimon'];
const FEMALE = ['Petra', 'Lucie', 'Kateřina', 'Tereza', 'Eva', 'Anna', 'Barbora', 'Veronika', 'Markéta', 'Klára', 'Jana', 'Martina', 'Hana', 'Lenka', 'Zuzana', 'Michaela', 'Adéla', 'Nikola', 'Simona', 'Monika'];
const SURNAMES: [string, string][] = [['Novák', 'Nováková'], ['Svoboda', 'Svobodová'], ['Dvořák', 'Dvořáková'], ['Černý', 'Černá'], ['Procházka', 'Procházková'], ['Kučera', 'Kučerová'], ['Veselý', 'Veselá'], ['Horák', 'Horáková'], ['Němec', 'Němcová'], ['Pokorný', 'Pokorná'], ['Pospíšil', 'Pospíšilová'], ['Hájek', 'Hájková'], ['Jelínek', 'Jelínková'], ['Král', 'Králová'], ['Růžička', 'Růžičková'], ['Beneš', 'Benešová'], ['Fiala', 'Fialová'], ['Sedláček', 'Sedláčková'], ['Doležal', 'Doležalová'], ['Zeman', 'Zemanová'], ['Kolář', 'Kolářová'], ['Navrátil', 'Navrátilová'], ['Čermák', 'Čermáková'], ['Urban', 'Urbanová'], ['Vaněk', 'Vaňková'], ['Blažek', 'Blažková'], ['Kříž', 'Křížová'], ['Kovář', 'Kovářová'], ['Bartoš', 'Bartošová'], ['Vlček', 'Vlčková']];
const BUSINESS = ['Studio', 'Ateliér', 'Kavárna', 'Pekárna', 'Květinářství', 'Truhlářství', 'Autoservis', 'Fitness', 'Jóga studio', 'Účetnictví', 'Reality', 'Kadeřnictví', 'Vinárna', 'Penzion', 'Cukrárna', 'Zahradnictví', 'Fotoateliér', 'Tiskárna', 'Minipivovar', 'Keramika'];
const CITIES = ['Olomouc', 'Brno', 'Praha', 'Ostrava', 'Přerov', 'Prostějov', 'Zlín', 'Hradec Králové', 'Pardubice', 'Liberec', 'Jihlava', 'Kroměříž'];
const COLORS = ['blue', 'pink', 'green', 'orange', 'purple'];
const SOURCES = ['Formulář', 'Webinář', 'Chatbot', 'Import', 'Doporučení', 'Kampaň'];

function consentFor(r: Rand, state: ConsentState, created: string, source: string): Consent {
  const history = state === 'Bez souhlasu' ? [] : [{ date: created, state: 'Čeká na potvrzení' as ConsentState, source }];
  if (state === 'Udělen' || state === 'Odvolán') history.push({ date: created, state: 'Udělen', source: 'Potvrzení e-mailem (double opt-in)' });
  if (state === 'Odvolán') history.push({ date: created, state: 'Odvolán', source: 'Odkaz pro odhlášení v e-mailu' });
  return { state, source, date: created, ip: `10.${int(r, 0, 255)}.${int(r, 0, 255)}.${int(r, 1, 254)}`, doubleOptIn: state === 'Udělen' || state === 'Odvolán', history };
}

/* ---------- block template for the built-in editor ---------- */
export const defaultBlocks: Block[] = [
  { id: 'logo', type: 'logo', text: 'softema', align: 'left' },
  { id: 'headline', type: 'heading', text: 'Podzim přeje\nnovým nápadům.', color: '#24282d', align: 'left' },
  { id: 'intro', type: 'text', text: 'Ahoj {{jmeno}},\n\nléto je za námi. Teď je ten správný čas dát vašemu marketingu nový směr. Připravili jsme pro vás inspiraci, praktické tipy a jednu pozvánku, kterou si nechcete nechat ujít.' },
  { id: 'highlight', type: 'callout', text: 'Méně rutiny. Více výsledků.\nObjevte, co dnes dokáže chytrá automatizace.', color: '#fff2eb' },
  { id: 'cta', type: 'button', text: 'Chci načerpat inspiraci', color: '#ed6637', url: 'https://softema.cz' },
  { id: 'line', type: 'divider', text: '' },
  { id: 'footer', type: 'footer', text: 'Softema Creative s.r.o. · Olomouc\nTento e-mail dostáváte, protože jste přihlášeni k našemu newsletteru.\nOdhlásit odběr · Upravit předvolby' },
];
const blocksFor = (headline: string, cta: string, brand = 'softema') => defaultBlocks.map(b => ({ ...b, text: b.type === 'heading' ? headline : b.type === 'button' ? cta : b.type === 'logo' ? brand : b.text }));

/* ---------- workspace profiles ---------- */
interface Profile {
  ws: string; seed: number; idStart: number; count: number; owner: string;
  named: { name: string; email: string; company: string; stage: Lifecycle; tags: string[]; source: string; color: string; city: string; consent: ConsentState; createdDays: number; custom?: [string, string][]; notes?: string[] }[];
  tags: string[]; b2b: number; domain: (company: string) => string;
}
const SOFTEMA: Profile = {
  ws: WS_SOFTEMA, seed: 7, idStart: 1, count: 168, owner: 'Marie Smolková', b2b: 0.75, domain: c => `${slug(c)}.example`,
  tags: ['Newsletter', 'VIP', 'Webinář', 'Kurz', 'B2B', 'E-shop', 'Lead magnet'],
  named: [
    { name: 'Jan Novák', email: 'jan.novak@novakstudio.example', company: 'Novák Studio', stage: 'Klient', tags: ['VIP', 'Newsletter'], source: 'Webinář', color: 'blue', city: 'Olomouc', consent: 'Udělen', createdDays: 22, custom: [['Obor', 'Grafické studio a branding'], ['Počet zaměstnanců', '8'], ['Preferovaný kanál', 'E-mail, dopoledne'], ['Fakturace', 'Měsíčně, splatnost 14 dní']], notes: ['Zájem o rozšíření spolupráce na e-mailing. Ozvat se s návrhem začátkem října.'] },
    { name: 'Petra Svobodová', email: 'petra@bloomdesign.example', company: 'Bloom Design', stage: 'Klient', tags: ['Newsletter', 'Kurz'], source: 'Formulář', color: 'pink', city: 'Brno', consent: 'Udělen', createdDays: 64 },
    { name: 'Tomáš Dvořák', email: 'tomas@dvorakpartners.example', company: 'Dvořák & Partners', stage: 'Zájemce', tags: ['Webinář', 'B2B'], source: 'Webinář', color: 'green', city: 'Praha', consent: 'Udělen', createdDays: 0 },
    { name: 'Lucie Procházková', email: 'lucie@atelierlp.example', company: 'Ateliér LP', stage: 'Klient', tags: ['VIP', 'Kurz'], source: 'Doporučení', color: 'orange', city: 'Brno', consent: 'Udělen', createdDays: 120, custom: [['Obor', 'Architektura interiérů'], ['Město', 'Brno'], ['Zájem o', 'Kurz Marketing od základů']] },
    { name: 'Martin Černý', email: 'martin@cernydigital.example', company: 'Černý Digital', stage: 'Zájemce', tags: ['Newsletter'], source: 'Chatbot', color: 'purple', city: 'Ostrava', consent: 'Udělen', createdDays: 12 },
    { name: 'Kateřina Veselá', email: 'katerina@kavarnakafe.example', company: 'Kavárna Kafe', stage: 'Klient', tags: ['Newsletter', 'B2B'], source: 'Formulář', color: 'blue', city: 'Olomouc', consent: 'Udělen', createdDays: 200 },
    { name: 'Pavel Horák', email: 'pavel@horakstavby.example', company: 'Horák Stavby', stage: 'Klient', tags: ['VIP', 'B2B'], source: 'Import', color: 'green', city: 'Přerov', consent: 'Udělen', createdDays: 310, custom: [['Obor', 'Stavebnictví'], ['Počet poboček', '3'], ['Rozpočet na marketing', '25 000 Kč / měsíc']] },
    { name: 'Anna Němcová', email: 'anna@annaceramics.example', company: 'Anna Ceramics', stage: 'Zájemce', tags: ['Kurz', 'Newsletter'], source: 'Webinář', color: 'pink', city: 'Zlín', consent: 'Udělen', createdDays: 40 },
    { name: 'David Pokorný', email: 'david@pokr.example', company: 'POKR Creative', stage: 'Klient', tags: ['Newsletter'], source: 'Doporučení', color: 'purple', city: 'Praha', consent: 'Udělen', createdDays: 150 },
    { name: 'Tereza Malá', email: 'tereza@malastudio.example', company: 'Malá Studio', stage: 'Zájemce', tags: ['B2B'], source: 'Import', color: 'orange', city: 'Olomouc', consent: 'Odvolán', createdDays: 260 },
    { name: 'Michal Král', email: 'michal@kraltech.example', company: 'Král Technologies', stage: 'Lead', tags: ['Webinář'], source: 'Chatbot', color: 'blue', city: 'Hradec Králové', consent: 'Čeká na potvrzení', createdDays: 5 },
    { name: 'Barbora Fialová', email: 'bara@fialovakvetina.example', company: 'Fialová květina', stage: 'Klient', tags: ['Kurz', 'Newsletter'], source: 'Formulář', color: 'pink', city: 'Prostějov', consent: 'Udělen', createdDays: 90 },
  ],
};
const LEGS: Profile = {
  ws: WS_4LEGS, seed: 41, idStart: 1001, count: 92, owner: 'Marie Smolková', b2b: 0.08, domain: () => 'posta.example',
  tags: ['Newsletter', 'Psí krmivo', 'Kočky', 'Věrnostní program', 'VIP', 'Akce'],
  named: [
    { name: 'Adam Beneš', email: 'adam@posta.example', company: '', stage: 'Klient', tags: ['Newsletter', 'Psí krmivo'], source: 'Formulář', color: 'blue', city: 'Brno', consent: 'Udělen', createdDays: 30, custom: [['Mazlíček', 'Pes – labradorský retrívr'], ['Věrnostní program', 'Zlatá úroveň']] },
    { name: 'Eva Konečná', email: 'eva@posta.example', company: '', stage: 'Klient', tags: ['Newsletter', 'Kočky'], source: 'Kampaň', color: 'pink', city: 'Praha', consent: 'Udělen', createdDays: 75 },
    { name: 'Ondřej Urban', email: 'ondrej@posta.example', company: '', stage: 'Zájemce', tags: ['Newsletter'], source: 'Chatbot', color: 'green', city: 'Olomouc', consent: 'Udělen', createdDays: 3 },
    { name: 'Klára Marková', email: 'klara@posta.example', company: '', stage: 'Klient', tags: ['Věrnostní program', 'Kočky'], source: 'Formulář', color: 'orange', city: 'Zlín', consent: 'Udělen', createdDays: 140 },
  ],
};

function makeContacts(p: Profile, now: Date): Contact[] {
  const r = prng(p.seed); const { ago } = seedClock(now); const out: Contact[] = [];
  const nid = () => `n-${p.idStart}-${out.length}-${Math.floor(r() * 1e6).toString(36)}`;
  p.named.forEach((n, i) => {
    const created = ago(n.createdDays, 9 + (i % 7), (i * 7) % 60);
    out.push({
      id: p.idStart + i, workspaceId: p.ws, name: n.name, email: n.email, phone: `+420 7${24 + i} 658 ${140 + i}`, company: n.company, city: n.city,
      tags: n.tags, stage: n.stage, source: n.source, owner: p.owner, color: n.color, createdAt: created,
      notes: (n.notes || []).map(text => ({ id: nid(), text, author: 'Marie Smolková', date: ago(1, 16, 20) })),
      customFields: (n.custom || []).map(([name, value], k) => ({ id: `cf-${p.idStart + i}-${k + 1}`, name, value })),
      consent: consentFor(r, n.consent, created, n.source === 'Import' ? 'Import CSV (původní souhlas)' : `Formulář: ${n.source}`),
    });
  });
  const used = new Set(out.map(c => c.email));
  while (out.length < p.count) {
    const female = chance(r, 0.55);
    const first = pick(r, female ? FEMALE : MALE); const sur = pick(r, SURNAMES); const last = female ? sur[1] : sur[0];
    const name = `${first} ${last}`;
    const b2b = chance(r, p.b2b);
    const company = b2b ? `${pick(r, BUSINESS)} ${sur[0]}` : '';
    let email = `${slug(first)}.${slug(last)}@${b2b ? p.domain(company) : 'posta.example'}`;
    if (used.has(email)) email = email.replace('@', `${out.length}@`);
    used.add(email);
    const createdDays = chance(r, 0.18) ? int(r, 0, 29) : int(r, 30, 540);
    const created = ago(createdDays, int(r, 7, 20), int(r, 0, 59));
    const roll = r();
    const stage: Lifecycle = roll < 0.34 ? 'Klient' : roll < 0.74 ? 'Zájemce' : 'Lead';
    const c = r();
    const consent: ConsentState = c < 0.8 ? 'Udělen' : c < 0.88 ? 'Čeká na potvrzení' : c < 0.95 ? 'Odvolán' : 'Bez souhlasu';
    const source = pick(r, SOURCES);
    const tags = p.tags.filter((t, k) => chance(r, k === 0 ? 0.62 : k === 1 && p.ws === WS_SOFTEMA ? 0.08 : 0.22));
    out.push({
      id: p.idStart + out.length, workspaceId: p.ws, name, email, phone: `+420 7${int(r, 20, 79)} ${int(r, 100, 999)} ${int(r, 100, 999)}`, company, city: pick(r, CITIES),
      tags, stage, source, owner: p.owner, color: pick(r, COLORS), createdAt: created, notes: [], customFields: [],
      consent: consentFor(r, consent, created, source === 'Import' ? 'Import CSV (původní souhlas)' : `Formulář: ${source}`),
    });
  }
  return out;
}

/* ---------- segments ---------- */
function makeSegments(ws: string, now: Date): Segment[] {
  const { ago } = seedClock(now);
  const s = (id: string, name: string, description: string, rules: Segment['rules'], match: Segment['match'] = 'all'): Segment => ({ id: `${ws.slice(-2)}-${id}`, workspaceId: ws, name, description, match, rules, createdAt: ago(60) });
  if (ws === WS_SOFTEMA) return [
    s('newsletter', 'Odběratelé newsletteru', 'Kontakty se štítkem Newsletter', [{ id: 'r1', field: 'tag', op: 'is', value: 'Newsletter' }]),
    s('vip', 'VIP klienti', 'Klíčoví zákazníci se štítkem VIP', [{ id: 'r1', field: 'tag', op: 'is', value: 'VIP' }]),
    s('webinar', 'Zájemci o webináře', 'Štítek Webinář nebo zdroj Webinář', [{ id: 'r1', field: 'tag', op: 'is', value: 'Webinář' }, { id: 'r2', field: 'source', op: 'is', value: 'Webinář' }], 'any'),
    s('clients', 'Klienti', 'Kontakty ve fázi Klient', [{ id: 'r1', field: 'stage', op: 'is', value: 'Klient' }]),
    s('new', 'Noví za 30 dní', 'Kontakty přidané v posledních 30 dnech', [{ id: 'r1', field: 'createdDays', op: 'lessThan', value: '30' }]),
  ];
  return [
    s('newsletter', 'Odběratelé newsletteru', 'Kontakty se štítkem Newsletter', [{ id: 'r1', field: 'tag', op: 'is', value: 'Newsletter' }]),
    s('cats', 'Majitelé koček', 'Štítek Kočky', [{ id: 'r1', field: 'tag', op: 'is', value: 'Kočky' }]),
    s('loyal', 'Věrnostní program', 'Členové věrnostního programu', [{ id: 'r1', field: 'tag', op: 'is', value: 'Věrnostní program' }]),
  ];
}

/* ---------- payments ---------- */
const SOFTEMA_SERVICES: [string, number][] = [['Marketingová konzultace', 12900], ['Správa e-mailového marketingu', 18500], ['Marketingová strategie', 26900], ['AI workshop', 9900], ['Správa kampaní', 18400], ['Kurz Marketing od základů', 4900], ['Tvorba landing page', 32000], ['Audit webu', 7900]];
const LEGS_ORDERS: [string, number][] = [['Objednávka granulí', 1290], ['Objednávka – kočičí sortiment', 890], ['Objednávka pamlsků', 590], ['Velký nákup krmiva', 2390], ['Objednávka doplňků', 740]];

function makePayments(ws: string, contacts: Contact[], now: Date) {
  const r = prng(ws === WS_SOFTEMA ? 91 : 93); const { ago, at } = seedClock(now);
  const invoices: Invoice[] = []; const transactions: Transaction[] = []; const subscriptions: Subscription[] = [];
  const clients = contacts.filter(c => c.stage === 'Klient');
  const catalog = ws === WS_SOFTEMA ? SOFTEMA_SERVICES : LEGS_ORDERS;
  const perMonth = ws === WS_SOFTEMA ? 18 : 95;
  const total = Math.round(perMonth * 4);
  let seq = 1;
  const year = now.getFullYear();
  for (let i = 0; i < total; i++) {
    const days = Math.floor((i / total) * 120); // spread over the last 120 days, newest first
    const c = i === 0 && ws === WS_SOFTEMA ? contacts[0] : pick(r, clients);
    const [name, price] = i === 0 && ws === WS_SOFTEMA ? SOFTEMA_SERVICES[0] : pick(r, catalog);
    const qty = ws === WS_SOFTEMA ? 1 : int(r, 1, 3);
    const issued = ago(days + int(r, 1, 6), 9, int(r, 0, 59));
    const due = new Date(issued); due.setDate(due.getDate() + 14);
    const id = `inv-${ws.slice(-2)}-${i}`;
    let status: Invoice['status'] = 'Zaplacená';
    if (days < 3 && i % 5 === 1) status = 'Koncept';
    else if (days < 20 && i % 4 === 2) status = 'Odeslaná';
    else if (days >= 20 && days < 60 && i % 13 === 5) status = 'Odeslaná'; // now overdue
    else if (i % 37 === 11) status = 'Stornovaná';
    const paidAt = status === 'Zaplacená' ? ago(days, int(r, 8, 18), int(r, 0, 59)) : undefined;
    invoices.push({ id, workspaceId: ws, number: `${year}${String(seq++).padStart(4, '0')}`, contactId: c.id, items: [{ id: `${id}-1`, name, qty, price }], status, issuedAt: issued, dueAt: due.toISOString(), paidAt, note: '' });
    if (paidAt) transactions.push({ id: `tx-${ws.slice(-2)}-${i}`, workspaceId: ws, contactId: c.id, amount: price * qty, status: 'Úspěšná', method: chance(r, 0.6) ? 'Karta' : chance(r, 0.5) ? 'Bankovní převod' : 'Platební odkaz', date: paidAt, description: name, invoiceId: id });
  }
  // a few failed card payments and one refund
  for (let k = 0; k < 4; k++) { const c = pick(r, clients); const [name, price] = pick(r, catalog); transactions.push({ id: `tx-${ws.slice(-2)}-f${k}`, workspaceId: ws, contactId: c.id, amount: price, status: 'Neúspěšná', method: 'Karta', date: ago(int(r, 1, 80), 13), description: `${name} – zamítnuto bankou` }); }
  const refundOf = transactions.find(t => t.status === 'Úspěšná' && t.date < ago(30));
  if (refundOf) transactions.push({ ...refundOf, id: `${refundOf.id}-r`, amount: -refundOf.amount, status: 'Vrácená', date: ago(18, 11), description: `Vrácení: ${refundOf.description}` });
  transactions.sort((a, b) => b.date.localeCompare(a.date));
  const plans: [string, number][] = ws === WS_SOFTEMA ? [['Správa sociálních sítí', 6900], ['Správa e-mailingu', 18500], ['Marketingový klub', 490], ['Kurzy Premium', 990]] : [['Krmivo na předplatné', 1190], ['Pamlsková krabička', 390]];
  clients.slice(0, ws === WS_SOFTEMA ? 26 : 30).forEach((c, k) => {
    const [plan, price] = plans[k % plans.length];
    const status: Subscription['status'] = k % 11 === 4 ? 'Pozastaveno' : k % 13 === 7 ? 'Zrušeno' : 'Aktivní';
    subscriptions.push({ id: `sub-${ws.slice(-2)}-${k}`, workspaceId: ws, contactId: c.id, plan, price, interval: 'měsíčně', status, startedAt: ago(int(r, 40, 400)), nextPaymentAt: at(int(r, 1, 29)) });
  });
  const links: PaymentLink[] = ws === WS_SOFTEMA ? [
    { id: 'pl-1', workspaceId: ws, name: 'Marketingová konzultace (60 min)', amount: 2900, kind: 'Jednorázová', active: true, opened: 148, paid: 37, slug: 'konzultace', createdAt: ago(90) },
    { id: 'pl-2', workspaceId: ws, name: 'Marketingový klub – měsíční členství', amount: 490, kind: 'Předplatné', active: true, opened: 212, paid: 64, slug: 'klub', createdAt: ago(120) },
  ] : [{ id: 'pl-3', workspaceId: ws, name: 'Dárkový poukaz 500 Kč', amount: 500, kind: 'Jednorázová', active: true, opened: 96, paid: 22, slug: 'poukaz', createdAt: ago(60) }];
  const coupons: Coupon[] = ws === WS_SOFTEMA ? [
    { id: 'cp-1', workspaceId: ws, code: 'PODZIM20', kind: 'percent', value: 20, limit: 100, used: 23, expiresAt: at(30), active: true },
    { id: 'cp-2', workspaceId: ws, code: 'WEBINAR500', kind: 'fixed', value: 500, limit: 50, used: 50, expiresAt: ago(5), active: false },
  ] : [{ id: 'cp-3', workspaceId: ws, code: 'MAZLICEK10', kind: 'percent', value: 10, limit: 500, used: 141, expiresAt: at(60), active: true }];
  return { invoices, transactions, subscriptions, paymentLinks: links, coupons };
}

/* ---------- campaigns ---------- */
function campaignResults(seed: number, recipients: Contact[], openRate: number, clickRate: number, links: string[]) {
  const r = prng(seed);
  return recipients.map(c => {
    const delivered = !chance(r, 0.004);
    const opened = delivered && chance(r, openRate);
    const clicked = opened && chance(r, clickRate / Math.max(openRate, 0.01));
    return { contactId: c.id, delivered, opened, clicked, unsubscribed: delivered && chance(r, 0.003), link: clicked ? pick(r, links) : undefined };
  });
}

/* ---------- courses ---------- */
const QUIZ = '? Co nejlépe popisuje personu?\n* Model typického zákazníka s jeho cíli a potížemi\n- Logo a barvy firmy\n- Seznam všech kontaktů\n? Kde nejspolehlivěji zjistíte potřeby zákazníků?\n* V rozhovorech se zákazníky\n- V ceníku konkurence\n- Ve statistikách návštěvnosti';
const lesson = (id: string, title: string, type: Lesson['type'], duration: number, dripDays = 0, preview = false, text = ''): Lesson => ({ id, title, type, duration, videoUrl: type === 'Video' ? 'https://stream.example/video-ukazka' : '', text: text || (type === 'Text' ? 'Text lekce s praktickými kroky a příklady.\n\nNa konci lekce najdete krátké shrnutí a úkol na procvičení.' : type === 'Kvíz' ? QUIZ : ''), attachments: [], dripDays, preview });
function softemaCourses(ws: string, now: Date): Course[] {
  const { ago } = seedClock(now);
  const m1: CourseModule[] = [
    { id: 'm1', title: 'Proč marketing nefunguje bez strategie', lessons: [lesson('l1', 'Vítejte v kurzu', 'Video', 6, 0, true), lesson('l2', 'Jak si stanovit cíle', 'Video', 14), lesson('l3', 'Pracovní list: moje cíle', 'Soubor', 5)] },
    { id: 'm2', title: 'Kdo je váš zákazník', lessons: [lesson('l4', 'Persona v praxi', 'Video', 18, 7), lesson('l5', 'Rozhovory se zákazníky', 'Text', 10, 7), lesson('l6', 'Kvíz: znáte své zákazníky?', 'Kvíz', 5, 7)] },
    { id: 'm3', title: 'Obsah, který přitahuje', lessons: [lesson('l7', 'Obsahová strategie na jednu stránku', 'Video', 21, 14), lesson('l8', 'Plán publikování', 'Soubor', 8, 14), lesson('l9', 'Jak psát pro web', 'Text', 12, 14)] },
    { id: 'm4', title: 'E-mail a automatizace', lessons: [lesson('l10', 'První newsletter', 'Video', 17, 21), lesson('l11', 'Uvítací sekvence', 'Video', 15, 21), lesson('l12', 'Závěrečný test', 'Kvíz', 10, 21)] },
  ];
  const m2: CourseModule[] = [
    { id: 'm1', title: 'Základy práce s AI', lessons: [lesson('l1', 'Co AI zvládne a co ne', 'Video', 12, 0, true), lesson('l2', 'Jak psát zadání', 'Video', 16), lesson('l3', 'Knihovna promptů', 'Soubor', 4)] },
    { id: 'm2', title: 'AI v každodenní práci', lessons: [lesson('l4', 'Texty a e-maily', 'Video', 19), lesson('l5', 'Analýza dat', 'Video', 22), lesson('l6', 'Etika a ochrana dat', 'Text', 9), lesson('l7', 'Praktický úkol', 'Text', 15), lesson('l8', 'Závěrečný kvíz', 'Kvíz', 6)] },
  ];
  const m3: CourseModule[] = [
    { id: 'm1', title: 'Předmět, který se otevírá', lessons: [lesson('l1', 'Anatomie předmětu', 'Video', 11, 0, true), lesson('l2', 'Preheader a odesílatel', 'Text', 7)] },
    { id: 'm2', title: 'Obsah e-mailu', lessons: [lesson('l3', 'Struktura newsletteru', 'Video', 14), lesson('l4', 'Výzva k akci', 'Video', 9)] },
  ];
  return [
    { id: 'c-marketing', workspaceId: ws, title: 'Marketing od základů', subtitle: 'Váš první krok', description: 'Pevné základy pro marketing, který přináší výsledky. Od strategie přes obsah až po e-mailové automatizace.', accent: 'orange', price: 4900, priceType: 'Jednorázově', status: 'Publikováno', drip: 'Postupně', certificate: true, modules: m1, createdAt: ago(240), updatedAt: ago(12) },
    { id: 'c-ai', workspaceId: ws, title: 'AI v každodenní praxi', subtitle: 'Pracujte chytřeji', description: 'Méně rutiny, více prostoru pro vaše nejlepší nápady. Praktické postupy pro práci s AI v malé firmě.', accent: 'dark', price: 990, priceType: 'Předplatné', status: 'Publikováno', drip: 'Vše hned', certificate: false, modules: m2, createdAt: ago(130), updatedAt: ago(30) },
    { id: 'c-email', workspaceId: ws, title: 'E-mailing, který prodává', subtitle: 'Buďte ve spojení', description: 'Od dobrého předmětu k dlouhodobému vztahu se zákazníky.', accent: 'blue', price: 2900, priceType: 'Jednorázově', status: 'Koncept', drip: 'Vše hned', certificate: false, modules: m3, createdAt: ago(20), updatedAt: ago(2) },
  ];
}
function legsCourses(ws: string, now: Date): Course[] {
  const { ago } = seedClock(now);
  return [{ id: 'c-puppy', workspaceId: ws, title: 'Výchova štěněte krok za krokem', subtitle: 'Online kurz pro nové páníčky', description: 'Prvních 12 týdnů se štěnětem: socializace, krmení a základní povely.', accent: 'green', price: 0, priceType: 'Zdarma', status: 'Publikováno', drip: 'Postupně', certificate: false, createdAt: ago(100), updatedAt: ago(9), modules: [
    { id: 'm1', title: 'První dny doma', lessons: [lesson('l1', 'Příprava domova', 'Video', 8, 0, true), lesson('l2', 'Krmení štěněte', 'Text', 6)] },
    { id: 'm2', title: 'Základní povely', lessons: [lesson('l3', 'Sedni a lehni', 'Video', 10, 7), lesson('l4', 'Chůze na vodítku', 'Video', 12, 14)] },
  ] }];
}

/* ---------- main ---------- */
export function createSeed(now = new Date()): HubData {
  const { ago, at } = seedClock(now);
  const data: HubData = {
    contacts: [], segments: [], deals: [], activities: [], campaigns: [], workflows: [], invoices: [], transactions: [], subscriptions: [], paymentLinks: [], coupons: [],
    courses: [], enrollments: [], products: [], purchases: [], groups: [], memberships: [], posts: [], webinars: [], registrations: [], chatbots: [], settings: [],
    profile: { name: 'Marie Smolková', email: 'marie@softema.example', phone: '+420 731 555 210', title: 'Správce pracovního prostoru', color: 'orange', twoFactor: true } satisfies UserProfile,
  };
  for (const p of [SOFTEMA, LEGS]) {
    const ws = p.ws; const soft = ws === WS_SOFTEMA; const r = prng(p.seed + 1000);
    const contacts = makeContacts(p, now); data.contacts.push(...contacts);
    const segments = makeSegments(ws, now); data.segments.push(...segments);
    const consenting = contacts.filter(c => c.consent.state === 'Udělen');
    const inSegment = (tag: string) => consenting.filter(c => c.tags.includes(tag));

    // deals
    const dealStages: DealStage[] = ['Nový lead', 'Kvalifikace', 'Nabídka odeslána', 'Vyjednávání', 'Vyhráno', 'Prohráno'];
    const dealContacts = contacts.filter(c => c.stage !== 'Lead').slice(0, soft ? 24 : 8);
    dealContacts.forEach((c, k) => {
      const stage = soft && c.id === 1 ? 'Nabídka odeslána' : dealStages[(k * 7) % dealStages.length];
      const [title, value] = soft ? (c.id === 1 ? ['Správa e-mailového marketingu', 18500] as const : SOFTEMA_SERVICES[k % SOFTEMA_SERVICES.length]) : ['Firemní odběr krmiva', 4900 + k * 300] as const;
      data.deals.push({ id: `deal-${ws.slice(-2)}-${k}`, workspaceId: ws, contactId: c.id, title, value, stage, probability: { 'Nový lead': 10, 'Kvalifikace': 25, 'Nabídka odeslána': 65, 'Vyjednávání': 80, 'Vyhráno': 100, 'Prohráno': 0 }[stage], createdAt: ago(int(r, 10, 90)), updatedAt: ago(int(r, 0, 9)) } satisfies Deal);
    });

    // campaigns
    const sender = soft ? ['Softema Creative', 'ahoj@mail.softema.cz'] : ['4legs.cz', 'novinky@mail.4legs.cz'];
    const segId = (s: string) => `${ws.slice(-2)}-${s}`;
    const camp = (id: number, name: string, subject: string, status: Campaign['status'], audience: string | null, days: number, open: number, click: number, headline: string, cta: string, eligible: Contact[]): Campaign => {
      const links = [cta, soft ? 'Více o našich službách' : 'Přejít do e-shopu', soft ? 'softema.cz' : '4legs.cz'];
      const base: Campaign = { id, workspaceId: ws, name, subject, preheader: soft ? 'Inspirace, tipy a novinky, které posunou váš marketing.' : 'Tipy a novinky pro vaše mazlíčky.', sender: sender[0], senderEmail: sender[1], status, audience: audience ? { type: 'segment', segmentId: segId(audience) } : { type: 'all' }, extraContactIds: [], editor: 'blocks', blocks: blocksFor(headline, cta, soft ? 'softema' : '4legs'), createdAt: ago(Math.max(days, 0) + 4), updatedAt: status === 'Koncept' ? ago(0, 9, 12) : ago(Math.max(days, 0)), links };
      if (status === 'Naplánováno') base.scheduledAt = at(-days, 9);
      if (status === 'Odesláno') { base.sentAt = ago(days, 10); base.results = campaignResults(id * 31, eligible, open, click, links); }
      return base;
    };
    if (soft) data.campaigns.push(
      camp(1, 'Podzimní inspirace pro váš marketing', 'Podzim přeje novým nápadům 🍂', 'Naplánováno', 'newsletter', -3, 0, 0, 'Podzim přeje\nnovým nápadům.', 'Chci načerpat inspiraci', []),
      camp(2, 'Jak na marketing, který přináší výsledky', '3 kroky k lepším výsledkům', 'Odesláno', null, 3, 0.428, 0.064, 'Marketing,\nkterý vás posune.', 'Chci načerpat inspiraci', consenting),
      camp(3, 'Pozvánka: AI v marketingu bez omáčky', 'Rezervujte si místo na našem webináři', 'Odesláno', 'webinar', 7, 0.482, 0.081, 'Dáme si marketing\nbez omáčky?', 'Rezervovat místo', consenting.filter(c => c.tags.includes('Webinář') || c.source === 'Webinář')),
      camp(4, 'Co je nového v Softemě? Září 2026', 'Zářijové novinky jsou tady', 'Odesláno', 'newsletter', 15, 0.396, 0.052, 'Zářijové\nnovinky.', 'Přečíst novinky', inSegment('Newsletter')),
      camp(5, 'Váš první krok k lepšímu e-mailingu', 'Začněte posílat e-maily, které lidé čtou', 'Koncept', 'new', 0, 0, 0, 'Pojďme být\nv kontaktu.', 'Začít', []),
      camp(6, 'Děkujeme za skvělý Business Fest!', 'Tohle byl náš první Business Fest', 'Odesláno', 'vip', 21, 0.683, 0.126, 'Děkujeme\nza setkání.', 'Prohlédnout fotky', inSegment('VIP')),
    );
    else data.campaigns.push(
      camp(101, 'Podzimní péče o vaše čtyřnohé parťáky', 'Novinky pro vaše mazlíčky', 'Odesláno', 'newsletter', 2, 0.384, 0.048, 'Podzimní péče\no mazlíčky.', 'Vybrat krmivo', inSegment('Newsletter')),
      camp(102, 'Novinky pro kočky', 'Nové hračky a pamlsky pro kočky', 'Koncept', 'cats', 0, 0, 0, 'Kočičí\nnovinky.', 'Prohlédnout', []),
    );

    // payments
    Object.entries(makePayments(ws, contacts, now)).forEach(([k, v]) => (data as unknown as Record<string, unknown[]>)[k].push(...(v as unknown[])));

    // courses, enrollments, products
    const courses = soft ? softemaCourses(ws, now) : legsCourses(ws, now); data.courses.push(...courses);
    courses.filter(c => c.status === 'Publikováno').forEach((course, ci) => {
      const lessons = course.modules.flatMap(m => m.lessons.map(l => l.id));
      const students = contacts.filter((c, k) => (soft && c.id === 1 && ci === 0) || (soft && c.id === 2 && ci === 0) || (k + ci * 3) % (soft ? 5 : 4) === 1).slice(0, soft ? 44 - ci * 14 : 26);
      students.forEach((c, k) => {
        const done = c.id === 1 ? 5 : c.id === 2 ? 4 : int(r, 0, lessons.length);
        data.enrollments.push({ id: `en-${course.id}-${c.id}`, workspaceId: ws, courseId: course.id, contactId: c.id, enrolledAt: ago(int(r, 5, 160)), completedLessonIds: lessons.slice(0, done), status: done === lessons.length ? 'Dokončeno' : k % 17 === 3 ? 'Pozastaveno' : 'Aktivní', lastActivityAt: ago(int(r, 0, 20)) } satisfies Enrollment);
      });
    });
    const products: DigitalProduct[] = soft ? [
      { id: 'dp-plan', workspaceId: ws, title: 'Šablona marketingového plánu', description: 'Editovatelná šablona plánu na 12 měsíců s ukázkovými cíli.', kind: 'Šablona', price: 490, status: 'Publikováno', files: [{ id: 'f1', name: 'marketingovy-plan.xlsx', size: 48_200, type: 'application/vnd.ms-excel', addedAt: ago(80) }], createdAt: ago(80) },
      { id: 'dp-ebook', workspaceId: ws, title: 'E-book: 50 předmětů, které se otevírají', description: 'Inspirace pro předměty newsletterů s komentářem, proč fungují.', kind: 'E-book', price: 290, status: 'Publikováno', files: [{ id: 'f1', name: '50-predmetu.pdf', size: 1_240_000, type: 'application/pdf', addedAt: ago(140) }], createdAt: ago(140) },
      { id: 'dp-audio', workspaceId: ws, title: 'Audio: Marketingové rituály na každé ráno', description: 'Krátké audio lekce na cestu do práce.', kind: 'Audio', price: 190, status: 'Koncept', files: [], createdAt: ago(6) },
    ] : [{ id: 'dp-feed', workspaceId: ws, title: 'E-book: Krmná dávka pro psy', description: 'Tabulky krmných dávek podle věku a hmotnosti.', kind: 'E-book', price: 149, status: 'Publikováno', files: [{ id: 'f1', name: 'krmna-davka.pdf', size: 820_000, type: 'application/pdf', addedAt: ago(50) }], createdAt: ago(50) }];
    data.products.push(...products);
    products.filter(pr => pr.status === 'Publikováno').forEach((pr, pi) => contacts.filter((_, k) => (k + pi) % (soft ? 9 : 6) === 2).slice(0, 18).forEach(c => data.purchases.push({ id: `pu-${pr.id}-${c.id}`, workspaceId: ws, productId: pr.id, contactId: c.id, date: ago(int(r, 1, 120)), downloads: int(r, 0, 4) } satisfies Purchase)));

    // community
    const groups: CommunityGroup[] = soft ? [
      { id: 'g-club', workspaceId: ws, name: 'Marketingový klub', description: 'Uzavřená skupina pro pravidelnou výměnu zkušeností a měsíční živé Q&A.', access: 'Placená', price: 490, accent: 'orange', createdAt: ago(200) },
      { id: 'g-alumni', workspaceId: ws, name: 'Absolventi: Marketing od základů', description: 'Prostor pro studenty a absolventy kurzu.', access: 'Součást kurzu', price: 0, courseId: 'c-marketing', accent: 'blue', createdAt: ago(230) },
      { id: 'g-open', workspaceId: ws, name: 'Webinářová komunita', description: 'Otevřená diskuse k našim webinářům.', access: 'Veřejná', price: 0, accent: 'green', createdAt: ago(90) },
    ] : [{ id: 'g-legs', workspaceId: ws, name: 'Komunita 4legs', description: 'Rady a zkušenosti majitelů psů a koček.', access: 'Veřejná', price: 0, accent: 'green', createdAt: ago(70) }];
    data.groups.push(...groups);
    groups.forEach((g, gi) => {
      const members = g.courseId ? data.enrollments.filter(e => e.courseId === g.courseId).map(e => contacts.find(c => c.id === e.contactId)!).filter(Boolean) : contacts.filter((_, k) => (k + gi) % (soft ? 4 : 3) === 0).slice(0, 36);
      members.forEach((c, k) => data.memberships.push({ id: `mb-${g.id}-${c.id}`, workspaceId: ws, groupId: g.id, contactId: c.id, role: k === 0 ? 'Moderátor' : 'Člen', status: k % 23 === 9 ? 'Zablokován' : g.access === 'Placená' && k % 19 === 5 ? 'Vypršelo' : 'Aktivní', joinedAt: ago(int(r, 3, 180)) } satisfies Membership));
    });
    const postsSeed: [string, string | number, string, number, [string, string][]][] = soft ? [
      ['g-club', 'Marie Smolková', 'Co vám v posledním měsíci nejvíc pomohlo v marketingu? Sdílejte jeden tip, který by ostatní měli vyzkoušet. Za mě: věnovat víc času předmětu newsletteru.', 12, [['Petra Svobodová', 'Segmentace databáze! Konečně posíláme relevantní obsah.']]],
      ['g-alumni', 2, 'Právě jsem dokončila modul o obsahové strategii. Díky za praktické příklady, konečně mám jasno, co a proč publikovat.', 8, []],
      ['g-open', 5, 'Bude ze středečního webináře záznam? Nestihnu to živě.', 3, [['Marie Smolková', 'Ano, záznam pošleme všem registrovaným do druhého dne.']]],
      ['g-club', 9, 'Hledám tip na nástroj pro plánování příspěvků na sociální sítě. Co používáte?', 5, []],
    ] : [['g-legs', 1001, 'Jaké pamlsky doporučujete pro štěně s citlivým bříškem?', 6, [['Eva Konečná', 'Nám se osvědčily sušené kousky králíka.']]]];
    postsSeed.forEach(([groupId, author, text, likes, comments], k) => {
      const contact = typeof author === 'number' ? contacts.find(c => c.id === author) : undefined;
      data.posts.push({ id: `post-${ws.slice(-2)}-${k}`, workspaceId: ws, groupId, author: contact ? contact.name : String(author), contactId: contact?.id, text, date: ago(k * 2, 9 + k, 15), pinned: k === 0, hidden: false, likes, likedByMe: false, comments: comments.map(([a, t], j) => ({ id: `cm-${k}-${j}`, author: a, text: t, date: ago(k * 2, 12 + j, 5), hidden: false })), reports: soft && k === 3 ? [{ id: 'rep-1', reason: 'Reklama / spam', by: 'Anna Němcová', date: ago(1, 18), resolved: false }] : [] } satisfies Post);
    });

    // webinars
    const host = soft ? 'Marie Smolková' : 'Tým 4legs';
    const web = (id: string, title: string, description: string, kind: Webinar['kind'], days: number, hour: number, accent: string, regs: number, attendRate: number, extra: Partial<Webinar> = {}): Webinar => {
      const w: Webinar = { id, workspaceId: ws, title, description, accent, kind, startsAt: at(days, hour), timezone: 'Europe/Prague', durationMin: 60, host, sessions: kind === 'evergreen' ? ['10:00', '18:00'] : [], video: kind === 'live' ? { source: 'LiveKit', url: '' } : { source: 'Mux', url: 'https://stream.example/evergreen-ukazka' }, published: true, cancelled: false, slug: slug(title), reminders: { confirmation: true, before24h: true, before1h: true, followUp: true, replayMail: true }, replayDays: 14, tag: 'Webinář', createdAt: ago(Math.max(10, -days + 20)), ...extra };
      const pool = contacts.filter((c, k) => (k + id.length) % (soft ? 3 : 4) === 0);
      pool.slice(0, regs).forEach(c => {
        const past = days < 0 || kind === 'evergreen';
        const attended = past ? chance(r, attendRate) : null;
        data.registrations.push({ id: `reg-${id}-${c.id}`, workspaceId: ws, webinarId: id, contactId: c.id, registeredAt: ago(Math.max(1, -days + int(r, 1, 12))), source: pick(r, ['Registrační stránka', 'E-mailová kampaň', 'Chatbot']), attended, watchMinutes: attended ? int(r, 12, 60) : 0, replay: past && !attended && chance(r, 0.35) } satisfies Registration);
      });
      return w;
    };
    if (soft) data.webinars.push(
      web('w-ai', 'AI v marketingu bez omáčky', 'Praktické ukázky, které můžete využít hned druhý den.', 'live', 5, 14, 'dark', 42, 0),
      web('w-mail', 'E-maily, na které se zákazníci těší', 'Od správného předmětu až po automatizaci, která prodává.', 'live', 13, 10, 'orange', 21, 0),
      web('w-strategy', 'Marketingová strategie na jednu stránku', 'Záznam workshopu s konkrétními příklady z praxe.', 'live', -8, 14, 'blue', 48, 0.62),
      web('w-auto', 'Automatizace pro malé firmy', 'Evergreen webinář: tři automatizace, které ušetří hodiny práce.', 'evergreen', -40, 10, 'green', 34, 0.55),
    );
    else data.webinars.push(web('w-food', 'Jak vybrat krmivo pro svého psa', 'Veterinářka radí, jak číst složení a dávkování.', 'live', 9, 18, 'green', 18, 0));

    // automations
    data.workflows.push(...makeWorkflows(ws, contacts, now));
    data.chatbots.push(makeChatbot(ws));
    data.settings.push(makeSettings(ws, now));

    // stored activities: events without their own entity (lead capture, tag changes …)
    const extra: Activity[] = soft ? [
      { id: 'act-1', workspaceId: ws, contactId: 3, type: 'form', title: 'Registrace přes formulář na webu', detail: 'Formulář: Webinář AI v marketingu', date: ago(0, 9, 8), route: 'webinare/w-ai' },
      { id: 'act-2', workspaceId: ws, contactId: 5, type: 'chatbot', title: 'Lead z chatbota', detail: 'Zajímal se o správu kampaní', date: ago(12, 15, 30), route: 'chatbot' },
    ] : [];
    data.activities.push(...extra);
    void r;
  }
  return data;
}

/* ---------- automations ---------- */
function flow(id: string, nodes: [string, string, string, Record<string, string>][], edges: [string, string, ('yes' | 'no')?][]): Pick<Workflow, 'nodes' | 'edges'> {
  // vertical layout: branches spread left/right
  const y: Record<string, number> = {}; const x: Record<string, number> = {};
  nodes.forEach(([nid], k) => { if (k === 0) { x[nid] = 0; y[nid] = 0; } });
  edges.forEach(([s, t, h]) => { y[t] = (y[s] ?? 0) + 150; x[t] = (x[s] ?? 0) + (h === 'yes' ? -170 : h === 'no' ? 170 : 0); });
  return {
    nodes: nodes.map(([nid, kind, title, config]) => ({ id: nid, position: { x: x[nid] ?? 0, y: y[nid] ?? 0 }, data: { kind: kind as Workflow['nodes'][number]['data']['kind'], title, config } })),
    edges: edges.map(([s, t, h]) => ({ id: `${id}-${s}-${t}`, source: s, target: t, sourceHandle: h ?? null })),
  };
}
function makeWorkflows(ws: string, contacts: Contact[], now: Date): Workflow[] {
  const { ago } = seedClock(now);
  const enroll = (nodeId: string, n: number, offset: number) => contacts.slice(offset, offset + n).map((c, k) => ({ contactId: c.id, nodeId, since: ago(k % 4, 9) }));
  if (ws === WS_SOFTEMA) return [
    { id: 'wf-welcome', workspaceId: ws, name: 'Uvítací sekvence', description: 'Nový odběratel newsletteru dostane přivítání a podle reakce další krok.', status: 'Aktivní', completed: 842, updatedAt: ago(4), enrolled: enroll('wait', 12, 20),
      ...flow('wf-welcome', [['trigger', 'trigger', 'Kontakt získá štítek', { event: 'tag_added', tag: 'Newsletter' }], ['mail', 'email', 'Pošleme milé přivítání', { subject: 'Vítejte v Softemě', template: 'Vítejte v Softemě' }], ['wait', 'wait', 'Počkat 2 dny', { amount: '2', unit: 'dny' }], ['cond', 'condition', 'Otevřel uvítací e-mail?', { check: 'email_opened', ref: 'mail' }], ['tagyes', 'tag', 'Přidat štítek „Aktivní zájemce“', { tag: 'Aktivní zájemce' }], ['remind', 'email', 'Připomenout se za 3 dny', { subject: 'Tohle vám uteklo', template: 'Tohle vám uteklo' }]],
        [['trigger', 'mail'], ['mail', 'wait'], ['wait', 'cond'], ['cond', 'tagyes', 'yes'], ['cond', 'remind', 'no']]) },
    { id: 'wf-webinar', workspaceId: ws, name: 'Připomínky před webinářem', description: 'Potvrzení registrace a připomínky 24 h a 1 h před začátkem.', status: 'Aktivní', completed: 284, updatedAt: ago(9), enrolled: enroll('wait24', 8, 40),
      ...flow('wf-webinar', [['trigger', 'trigger', 'Registrace na webinář', { event: 'webinar_registered', webinar: 'Jakýkoli' }], ['confirm', 'email', 'Potvrzení registrace', { subject: 'Registrace potvrzena' }], ['wait24', 'wait', 'Počkat do 24 h před začátkem', { amount: '24', unit: 'hodin před začátkem' }], ['rem24', 'email', 'Připomínka den předem', { subject: 'Zítra se uvidíme' }], ['rem1', 'email', 'Připomínka hodinu předem', { subject: 'Za hodinu začínáme' }]],
        [['trigger', 'confirm'], ['confirm', 'wait24'], ['wait24', 'rem24'], ['rem24', 'rem1']]) },
    { id: 'wf-course', workspaceId: ws, name: 'Po nákupu kurzu', description: 'Po úspěšné platbě přidá štítek Kurz a pošle přístupové údaje.', status: 'Aktivní', completed: 196, updatedAt: ago(20), enrolled: enroll('mail', 3, 60),
      ...flow('wf-course', [['trigger', 'trigger', 'Úspěšná platba', { event: 'payment_succeeded', product: 'Marketing od základů' }], ['tag', 'tag', 'Přidat štítek „Kurz“', { tag: 'Kurz' }], ['mail', 'email', 'Přístup do kurzu', { subject: 'Váš kurz je připravený' }], ['notify', 'notify', 'Upozornit tým', { to: 'marie@softema.cz' }]],
        [['trigger', 'tag'], ['tag', 'mail'], ['mail', 'notify']]) },
    { id: 'wf-winback', workspaceId: ws, name: 'Znovu v kontaktu po 90 dnech', description: 'Kontakty bez aktivity 90 dní dostanou nabídku konzultace.', status: 'Pozastaveno', completed: 128, updatedAt: ago(35), enrolled: [],
      ...flow('wf-winback', [['trigger', 'trigger', 'Datum / výročí', { event: 'date', rule: '90 dní bez aktivity' }], ['mail', 'email', 'Nabídka konzultace', { subject: 'Dlouho jsme se neviděli' }], ['stage', 'stage', 'Změnit fázi na Zájemce', { stage: 'Zájemce' }]],
        [['trigger', 'mail'], ['mail', 'stage']]) },
  ];
  return [{ id: 'wf-cart', workspaceId: ws, name: 'Opuštěný košík', description: 'Připomene nedokončený nákup a po dvou dnech nabídne slevu.', status: 'Aktivní', completed: 512, updatedAt: ago(6), enrolled: enroll('wait', 5, 4),
    ...flow('wf-cart', [['trigger', 'trigger', 'Webhook: opuštěný košík', { event: 'webhook', source: 'E-shop' }], ['wait', 'wait', 'Počkat 1 hodinu', { amount: '1', unit: 'hodin' }], ['mail', 'email', 'Připomínka košíku', { subject: 'Něco jste zapomněli' }], ['cond', 'condition', 'Dokončil nákup?', { check: 'payment_succeeded' }], ['end', 'end', 'Konec', {}], ['coupon', 'email', 'Sleva 10 %', { subject: 'Sleva 10 % jen pro vás' }]],
      [['trigger', 'wait'], ['wait', 'mail'], ['mail', 'cond'], ['cond', 'end', 'yes'], ['cond', 'coupon', 'no']]) }];
}

function makeChatbot(ws: string): ChatbotConfig {
  const soft = ws === WS_SOFTEMA; const t = new Date().toISOString();
  return {
    id: `bot-${ws.slice(-2)}`, workspaceId: ws, name: soft ? 'Sofi ze Softemy' : 'Fido z 4legs', color: soft ? '#ed6637' : '#2f7d6d', avatar: soft ? 'S' : 'F',
    welcome: soft ? 'Ahoj! Jsem Sofi, vaše marketingová parťačka. S čím vám dnes můžu pomoct?' : 'Ahoj! Poradím s výběrem krmiva i s objednávkou.',
    placeholder: 'Napište nám zprávu…', position: 'Vpravo dole', launcher: 'Potřebujete poradit?', active: true,
    persona: soft ? 'Pomáhej s otázkami o službách Softemy. Odpovídej česky, stručně a srozumitelně. Když odpověď neznáš, nabídni kontakt na tým.' : 'Raď s výběrem krmiva a stavem objednávek. Buď vlídný a stručný.',
    tone: 'Přátelský a profesionální', fallback: 'Tohle zatím nevím jistě. Nechte mi prosím e-mail a kolegové se vám ozvou.', languages: ['čeština'],
    leadCapture: { enabled: true, askName: true, askEmail: true, askPhone: false, tag: 'Chatbot lead' }, handoff: { enabled: true, email: soft ? 'ahoj@softema.cz' : 'podpora@4legs.cz' },
    sources: soft ? [
      { id: 'ks-1', kind: 'Webová stránka', title: 'softema.cz/sluzby', url: 'https://softema.cz/sluzby', content: 'Nabízíme marketingové strategie, tvorbu webů, PPC kampaně, e-mailing a automatizace pro malé a střední firmy.', status: 'Natrénováno', updatedAt: t },
      { id: 'ks-2', kind: 'Otázky a odpovědi', title: 'Ceny a konzultace', content: 'Kolik stojí konzultace? | Úvodní konzultace (60 min) stojí 2 900 Kč.\nJak se objednat? | Napište na ahoj@softema.cz nebo použijte formulář na webu.', status: 'Natrénováno', updatedAt: t },
      { id: 'ks-3', kind: 'Dokument', title: 'Představení agentury', content: 'Softema Creative je digitální agentura z Olomouce. Pomáháme firmám s marketingem, který přináší výsledky.', status: 'Natrénováno', updatedAt: t, file: { id: 'f-1', name: 'predstaveni-agentury.pdf', size: 340_000, type: 'application/pdf', addedAt: t } },
    ] : [{ id: 'ks-1', kind: 'FAQ', title: 'Doprava a vrácení', content: 'Kdy dorazí objednávka? | Do 2 pracovních dnů.\nMůžu zboží vrátit? | Ano, do 14 dnů bez udání důvodu.', status: 'Natrénováno', updatedAt: t }],
  };
}

function makeSettings(ws: string, now: Date): WorkspaceSettings {
  const soft = ws === WS_SOFTEMA; const { ago } = seedClock(now);
  const domain = soft ? 'mail.softema.cz' : 'mail.4legs.cz';
  const rec = (verified: boolean) => [
    { type: 'TXT' as const, host: domain, value: 'v=spf1 include:amazonses.com ~all', purpose: 'SPF' as const, verified },
    { type: 'TXT' as const, host: `resend._domainkey.${domain}`, value: 'p=MIGfMA0GCSqGSIb3DQEB…(ukázka)', purpose: 'DKIM' as const, verified },
    { type: 'TXT' as const, host: `_dmarc.${domain}`, value: 'v=DMARC1; p=none; rua=mailto:dmarc@' + domain.replace('mail.', ''), purpose: 'DMARC' as const, verified },
  ];
  const integ = (connected: boolean, account = '') => ({ connected, account, options: {} });
  return {
    id: `set-${ws.slice(-2)}`, workspaceId: ws, name: soft ? 'Softema Creative' : '4legs.cz', kind: soft ? 'Interní prostor agentury' : 'Klientský prostor',
    brandColor: soft ? '#c9481a' : '#2f7d6d',
    company: soft ? { legalName: 'Softema Creative s.r.o.', ico: '00000001', dic: 'CZ00000001', vatPayer: true, address: 'Ukázková 12, 779 00 Olomouc', email: 'fakturace@softema.example' } : { legalName: '4legs.cz (ukázkový klient)', ico: '00000002', dic: '', vatPayer: false, address: 'Ukázková 3, 602 00 Brno', email: 'info@4legs.example' },
    timezone: 'Europe/Prague', currency: 'CZK',
    team: soft ? [
      { id: 'tm-1', name: 'Marie Smolková', email: 'marie@softema.example', role: 'workspace_admin', status: 'Aktivní', color: 'orange' },
      { id: 'tm-2', name: 'Denis Vrána', email: 'denis@softema.example', role: 'agency_admin', status: 'Aktivní', color: 'blue' },
      { id: 'tm-3', name: 'Tereza Novotná', email: 'tereza@softema.example', role: 'member', status: 'Aktivní', color: 'pink' },
    ] : [
      { id: 'tm-1', name: 'Marie Smolková', email: 'marie@softema.example', role: 'workspace_admin', status: 'Aktivní', color: 'orange' },
      { id: 'tm-4', name: 'Klient 4legs', email: 'majitel@4legs.example', role: 'member', status: 'Pozvánka odeslána', color: 'green' },
    ],
    domains: [{ id: 'dom-1', domain, status: soft ? 'Ověřeno' : 'Čeká na DNS', records: rec(soft), addedAt: ago(soft ? 300 : 4) }],
    senders: [{ id: 'snd-1', name: soft ? 'Softema Creative' : '4legs.cz', email: soft ? 'ahoj@mail.softema.cz' : 'novinky@mail.4legs.cz', isDefault: true }],
    integrations: { resend: integ(soft, soft ? 'Softema – produkce' : ''), stripe: integ(soft, soft ? 'acct_…ukázka' : ''), fakturoid: integ(soft, soft ? 'softema' : ''), mux: integ(false), livekit: integ(false), n8n: integ(soft), claude: integ(false) },
    notifications: { payments: true, newContacts: true, campaigns: true, community: soft, webinars: true, dailyDigest: false },
    portal: { title: soft ? 'Softema Akademie' : 'Klub 4legs', color: soft ? '#c9481a' : '#2f7d6d', customDomain: '', magicLink: true },
    community: { gracePeriodDays: 7 },
    invoicing: { prefix: String(now.getFullYear()), dueDays: 14, nextNumber: 0 },
  };
}
