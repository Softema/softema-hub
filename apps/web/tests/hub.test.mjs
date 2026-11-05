// Unit tests of the local data layer (lib/hub): seed, versioned store, cross-module operations,
// segments, workflow validation and payments. Compiled with the TypeScript API like foundation.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Inside node_modules so that the compiled store can resolve `zod`.
const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const output = mkdtempSync(join(cache, 'hub-test-'));
process.on('exit', () => rmSync(output, { recursive: true, force: true }));
const files = ['store', 'ops', 'logic', 'flow', 'payments', 'format', 'seed', 'types'].map(f => `lib/hub/${f}.ts`);
const program = ts.createProgram(files, { outDir: output, rootDir: 'lib', module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10, target: ts.ScriptTarget.ES2022, skipLibCheck: true, strict: true, esModuleInterop: true });
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
program.emit();
writeFileSync(join(output, 'package.json'), '{"type":"commonjs"}');

// Minimal browser globals for the store (localStorage + page lifecycle listeners).
const mem = new Map();
const localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
globalThis.window = { localStorage, addEventListener() {}, removeEventListener() {} };
globalThis.document = { addEventListener() {}, visibilityState: 'visible' };

const require = createRequire(import.meta.url);
const load = m => require(join(output, 'hub', `${m}.js`));
const { hubStore, STORAGE_KEY, BACKUP_KEY, SCHEMA_VERSION, migrateV1 } = load('store');
const { createSeed, WS_SOFTEMA, WS_4LEGS } = load('seed');
const ops = load('ops');
const logic = load('logic');
const flow = load('flow');
const pay = load('payments');

const fresh = () => createSeed(new Date('2026-10-15T08:00:00Z'));
const inWs = (list, ws) => list.filter(x => x.workspaceId === ws);

test('seed: separate workspaces, unique contact ids, fictional e-mail domains', () => {
  const d = fresh();
  const a = inWs(d.contacts, WS_SOFTEMA); const b = inWs(d.contacts, WS_4LEGS);
  assert.ok(a.length > 100 && b.length > 50);
  assert.equal(new Set(d.contacts.map(c => c.id)).size, d.contacts.length, 'contact ids are unique across workspaces');
  for (const c of d.contacts) assert.match(c.email, /\.example$/, c.email);
  for (const key of ['campaigns', 'invoices', 'courses', 'webinars', 'workflows', 'groups']) assert.ok(d[key].every(x => x.workspaceId === WS_SOFTEMA || x.workspaceId === WS_4LEGS), key);
  // no record points to a contact of another workspace
  const ids = ws => new Set(inWs(d.contacts, ws).map(c => c.id));
  for (const key of ['deals', 'invoices', 'transactions', 'enrollments', 'registrations', 'memberships']) for (const x of d[key]) assert.ok(ids(x.workspaceId).has(x.contactId), `${key} ${x.id}`);
});

test('store: seeds once, persists, backs up unreadable data and resets one workspace', () => {
  const first = hubStore.getSnapshot();
  hubStore.flush();
  const saved = JSON.parse(mem.get(STORAGE_KEY));
  assert.equal(saved.version, SCHEMA_VERSION);
  assert.equal(saved.data.contacts.length, first.contacts.length);

  // a change in 4legs survives a reset of Softema
  hubStore.update(d => ({ ...d, contacts: d.contacts.map(c => (c.workspaceId === WS_4LEGS && c.id === 1001 ? { ...c, name: 'Upravený kontakt' } : c)) }));
  hubStore.update(d => ({ ...d, contacts: d.contacts.filter(c => !(c.workspaceId === WS_SOFTEMA && c.id === 1)) }));
  hubStore.reset(WS_SOFTEMA);
  const after = hubStore.getSnapshot();
  assert.ok(after.contacts.some(c => c.workspaceId === WS_SOFTEMA && c.id === 1), 'Softema restored');
  assert.equal(after.contacts.find(c => c.id === 1001).name, 'Upravený kontakt', '4legs untouched');
});

test('store: invalid stored data are moved to a backup key', () => {
  mem.set(STORAGE_KEY, '{"version":1,"data":{"contacts":"nope"}}');
  // force a reload through the cross-tab storage path
  const listeners = [];
  globalThis.window.addEventListener = (type, fn) => { if (type === 'storage') listeners.push(fn); };
  const unsubscribe = hubStore.subscribe(() => {});
  listeners.forEach(fn => fn({ key: STORAGE_KEY }));
  const d = hubStore.getSnapshot();
  assert.ok(d.contacts.length > 0, 'falls back to demo data');
  assert.equal(mem.get(BACKUP_KEY), '{"version":1,"data":{"contacts":"nope"}}');
  assert.match(hubStore.consumeLoadIssue() ?? '', /formátu/);
  unsubscribe();
});

test('store: v1 data migrate likes to reactions and posts into a forum category', () => {
  const d = fresh();
  const without = (x, ...keys) => { const c = { ...x }; for (const k of keys) delete c[k]; return c; };
  const v1 = { ...d, groups: d.groups.map(g => without(g, 'categories')), posts: d.posts.map((p, i) => ({ ...without(p, 'reactions', 'myReaction', 'categoryId'), likes: 4, likedByMe: i === 0 })) };
  const m = migrateV1(v1);
  for (const g of m.groups) assert.ok(g.categories.length > 0, g.id);
  for (const p of m.posts) {
    assert.ok(m.groups.find(g => g.id === p.groupId).categories.some(c => c.id === p.categoryId), p.id);
    assert.deepEqual(p.reactions, { like: 4 });
    assert.equal('likes' in p || 'likedByMe' in p, false);
  }
  assert.equal(m.posts[0].myReaction, 'like');
  assert.equal(m.posts[1].myReaction, undefined);
});

test('store: importing a one-workspace export replaces only that workspace and keeps a backup', () => {
  hubStore.reset();
  const known = [WS_SOFTEMA, WS_4LEGS];
  const cur = hubStore.getSnapshot();
  // export of 4legs with one renamed contact
  const only = Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, Array.isArray(v) ? v.filter(x => x.workspaceId === WS_4LEGS) : v]));
  only.contacts = only.contacts.map(c => (c.id === 1001 ? { ...c, name: 'Z importu' } : c));
  // a local change in Softema must survive the import
  hubStore.update(d => ({ ...d, contacts: d.contacts.map(c => (c.id === 1 ? { ...c, name: 'Lokální změna' } : c)) }));
  const r = hubStore.importData(JSON.stringify({ version: SCHEMA_VERSION, exportedAt: 'x', data: only }), known);
  assert.deepEqual(r.workspaces, [WS_4LEGS]);
  const after = hubStore.getSnapshot();
  assert.equal(after.contacts.find(c => c.id === 1001).name, 'Z importu');
  assert.equal(after.contacts.find(c => c.id === 1).name, 'Lokální změna');
  assert.ok(mem.get('softema-hub:data-before-import'), 'backup written');
  assert.throws(() => hubStore.importData('{"version":2,"data":{}}', known), /export Softema Hubu/);
  assert.throws(() => hubStore.importData('nope', known), /JSON/);
});

test('ops: contacts are deduplicated by e-mail (case-insensitive) per workspace', () => {
  const d = fresh();
  const r1 = ops.upsertContactByEmail(d, WS_SOFTEMA, { name: 'Nový Kontakt', email: 'NOVY@posta.example', source: 'Test', tags: ['A'] });
  assert.equal(r1.created, true);
  const r2 = ops.upsertContactByEmail(r1.data, WS_SOFTEMA, { name: 'Nový Kontakt', email: 'novy@posta.example', source: 'Test', tags: ['B'] });
  assert.equal(r2.created, false);
  assert.deepEqual(r2.contact.tags.sort(), ['A', 'B']);
  const r3 = ops.upsertContactByEmail(r2.data, WS_4LEGS, { name: 'Nový Kontakt', email: 'novy@posta.example', source: 'Test' });
  assert.equal(r3.created, true, 'the same e-mail is a separate contact in another workspace');
});

test('ops: webinar registration creates no duplicate registration', () => {
  const d = fresh();
  const a = ops.registerForWebinar(d, WS_SOFTEMA, 'w-ai', { name: 'Ema Testová', email: 'ema@posta.example', source: 'Test', consent: true });
  const b = ops.registerForWebinar(a.data, WS_SOFTEMA, 'w-ai', { name: 'Ema Testová', email: 'Ema@posta.example', source: 'Test', consent: true });
  assert.equal(b.duplicate, true);
  assert.equal(b.data.registrations.filter(r => r.contactId === a.contact.id).length, 1);
  assert.equal(a.contact.consent.state, 'Čeká na potvrzení');
});

test('ops: delete keeps accounting records, anonymisation removes personal data', () => {
  const d = fresh();
  const invoices = d.invoices.filter(i => i.workspaceId === WS_SOFTEMA && i.contactId === 1).length;
  const del = ops.deleteContacts(d, WS_SOFTEMA, [1]);
  assert.equal(del.contacts.some(c => c.workspaceId === WS_SOFTEMA && c.id === 1), false);
  assert.equal(del.invoices.filter(i => i.contactId === 1).length, invoices);
  assert.equal(del.deals.some(x => x.contactId === 1), false);
  const anon = ops.anonymizeContact(d, WS_SOFTEMA, 1).contacts.find(c => c.id === 1);
  assert.match(anon.email, /anonymizovano\.invalid$/);
  assert.deepEqual([anon.notes.length, anon.customFields.length, anon.consent.state], [0, 0, 'Bez souhlasu']);
});

test('logic: segments ignore diacritics and audiences only include consent "Udělen"', () => {
  const d = fresh();
  const contacts = inWs(d.contacts, WS_SOFTEMA);
  const ctx = logic.segmentContext(d, WS_SOFTEMA);
  const seg = { id: 's', workspaceId: WS_SOFTEMA, name: 's', description: '', match: 'all', createdAt: '', rules: [{ id: 'r', field: 'city', op: 'is', value: 'prerov' }] };
  const members = logic.segmentMembers(contacts, seg, ctx);
  assert.ok(members.length > 0 && members.every(c => c.city === 'Přerov'));
  const campaign = { workspaceId: WS_SOFTEMA, audience: { type: 'all' }, extraContactIds: [] };
  const a = logic.audienceOf(d, campaign);
  assert.ok(a.eligible.every(c => c.consent.state === 'Udělen'));
  assert.equal(a.members.length - a.eligible.length, a.excluded.noConsent + a.excluded.unsubscribed + a.excluded.pending);
});

test('ops: simulated send snapshots only eligible contacts', () => {
  const d = fresh();
  const draft = d.campaigns.find(c => c.workspaceId === WS_SOFTEMA && c.status === 'Koncept');
  const { data, campaign } = ops.simulateSend(d, WS_SOFTEMA, draft.id, '2026-10-15T09:00:00Z');
  assert.equal(campaign.status, 'Odesláno');
  const eligible = logic.audienceOf(d, draft).eligible.map(c => c.id).sort();
  assert.deepEqual(campaign.results.map(r => r.contactId).sort(), eligible);
  assert.equal(ops.simulateSend(data, WS_SOFTEMA, draft.id).campaign, undefined, 'sent campaigns are not sent again');
});

test('flow: validation finds missing branches, unreachable steps and cycles', () => {
  const n = (id, kind, config = {}) => ({ id, position: { x: 0, y: 0 }, data: { kind, title: id, config } });
  const ok = [n('t', 'trigger', { event: 'contact_created' }), n('m', 'email', { subject: 'Ahoj' }), n('c', 'condition', { check: 'email_opened' }), n('e', 'end'), n('x', 'end')];
  const edges = [{ id: '1', source: 't', target: 'm' }, { id: '2', source: 'm', target: 'c' }, { id: '3', source: 'c', target: 'e', sourceHandle: 'yes' }, { id: '4', source: 'c', target: 'x', sourceHandle: 'no' }];
  assert.deepEqual(flow.validateWorkflow(ok, edges), []);
  assert.match(flow.validateWorkflow(ok, edges.slice(0, 3)).map(i => i.text).join(' '), /větev Ano i Ne/);
  assert.match(flow.validateWorkflow([...ok, n('o', 'email', { subject: 'x' })], edges).map(i => i.text).join(' '), /není napojený/);
  assert.match(flow.validateWorkflow(ok, [...edges.slice(0, 2), { id: '5', source: 'c', target: 'm', sourceHandle: 'yes' }, edges[3]]).map(i => i.text).join(' '), /smyčku/);
  assert.match(flow.validateWorkflow([n('t', 'trigger', { event: 'contact_created' }), n('m', 'email', {})], [edges[0]]).map(i => i.text).join(' '), /předmět/);
});

test('flow: triggers enrol only into active matching workflows; a step applies its action', () => {
  const d = fresh();
  const welcome = d.workflows.find(f => f.id === 'wf-welcome');
  const contact = inWs(d.contacts, WS_SOFTEMA).find(c => !welcome.enrolled.some(e => e.contactId === c.id) && c.consent.state === 'Udělen');
  const fired = flow.fireTrigger(d, WS_SOFTEMA, 'tag_added', [contact.id], 'Newsletter');
  assert.ok(fired.workflows.find(f => f.id === 'wf-welcome').enrolled.some(e => e.contactId === contact.id));
  const other = flow.fireTrigger(d, WS_SOFTEMA, 'tag_added', [contact.id], 'VIP');
  assert.equal(other.workflows.find(f => f.id === 'wf-welcome').enrolled.some(e => e.contactId === contact.id), false);
  const paused = d.workflows.find(f => f.status === 'Pozastaveno');
  const evt = paused.nodes.find(x => x.data.kind === 'trigger').data.config.event;
  assert.equal(flow.fireTrigger(d, WS_SOFTEMA, evt, [contact.id]).workflows.find(f => f.id === paused.id).enrolled.length, paused.enrolled.length);
  // the course workflow adds the tag "Kurz" in its first step
  const course = d.workflows.find(f => f.id === 'wf-course');
  const withRun = { ...d, workflows: d.workflows.map(f => (f === course ? { ...f, enrolled: [{ contactId: contact.id, nodeId: 'tag', since: '' }] } : f)) };
  const step = flow.advanceWorkflow(withRun, WS_SOFTEMA, 'wf-course');
  assert.ok(step.data.contacts.find(c => c.id === contact.id).tags.includes('Kurz'));
  assert.equal(step.data.workflows.find(f => f.id === 'wf-course').enrolled[0].nodeId, 'mail');
});

test('payments: paying an invoice records one transaction; a refund only once', () => {
  const d = fresh();
  const inv = { ...pay.newInvoice(d, WS_SOFTEMA, 1, [{ id: 'i', name: 'Test', qty: 2, price: 1000 }]), status: 'Odeslaná' };
  assert.match(inv.number, /^\d{4}\d{4}$/);
  const paid = pay.payInvoice({ ...d, invoices: [inv, ...d.invoices] }, WS_SOFTEMA, inv.id);
  assert.equal(paid.invoices.find(i => i.id === inv.id).status, 'Zaplacená');
  const tx = paid.transactions.filter(t => t.invoiceId === inv.id);
  assert.equal(tx.length, 1); assert.equal(tx[0].amount, 2000);
  assert.equal(pay.payInvoice(paid, WS_SOFTEMA, inv.id), paid, 'paying twice changes nothing');
  const refunded = pay.refund(paid, WS_SOFTEMA, tx[0].id);
  assert.equal(pay.refund(refunded, WS_SOFTEMA, tx[0].id), refunded);
  assert.equal(logic.revenue(refunded.transactions.filter(t => t.invoiceId === inv.id), 0, Date.now() + 1e10), 0);
  assert.notEqual(pay.nextInvoiceNumber({ ...d, invoices: [inv, ...d.invoices] }, WS_SOFTEMA), inv.number);
});
