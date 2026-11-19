// Bulk actions over contacts: one transaction, server-side filter, per-contact timeline and audit, tenant isolation.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { type Ctx, start, uniqueEmail, WORKSPACE_A as A, WORKSPACE_B as B } from './helpers';

let ctx: Ctx;
before(async () => { ctx = await start(); });
after(async () => { await ctx.close(); });
const base = (ws: string) => `/api/v1/workspaces/${ws}`;
let n = 0;
const uniq = (p: string) => `${p}-${Date.now().toString(36)}-${++n}`;
const contact = async (extra: Record<string, unknown> = {}, ws = A, who: 'manager' | 'outsider' = 'manager') => {
  const r = await (await ctx.as(who)).post(`${base(ws)}/contacts`, { name: 'Hromadný Kontakt', email: uniqueEmail('bulk'), ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body;
};
const bulk = async (body: unknown, who: 'manager' | 'member' | 'outsider' = 'member', ws = A) => (await ctx.as(who)).post(`${base(ws)}/contacts/bulk`, body);
const tagsOf = async (id: string) => (await (await ctx.as('manager')).get(`${base(A)}/contacts/${id}`)).body.tags.map((t: any) => t.name);

describe('hromadné akce nad vybranými kontakty', () => {
  it('přidání štítku: jen kontakty bez štítku se změní, každý má záznam v časové ose a auditu', async () => {
    const tag = uniq('Akce');
    const a = await contact(), b = await contact({ tags: [tag] });
    const r = await bulk({ action: 'tag', tag: tag.toLowerCase(), target: { ids: [a.id, b.id] } });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.deepEqual(r.body, { matched: 2, changed: 1 });
    assert.deepEqual(await tagsOf(a.id), [tag], 'použije se existující zápis štítku');
    const acts = (await (await ctx.as('member')).get(`${base(A)}/contacts/${a.id}/activities`)).body.items;
    assert.equal(acts[0].title, `Přidán štítek ${tag}`); assert.match(acts[0].detail, /Hromadná akce/); assert.equal(acts[0].actor.id, 'seed-member');
    assert.equal(await ctx.ownerDb.auditLog.count({ where: { entityId: b.id, action: 'tag.add' } }), 0, 'kontakt beze změny nemá audit');
    assert.equal(await ctx.ownerDb.auditLog.count({ where: { entityId: a.id, action: 'tag.add' } }), 1);
    assert.deepEqual((await bulk({ action: 'tag', tag, target: { ids: [a.id, b.id] } })).body, { matched: 2, changed: 0 }, 'opakování nic nezmění');
  });

  it('odebrání štítku a neznámý štítek', async () => {
    const tag = uniq('Pryc');
    const a = await contact({ tags: [tag, 'Zůstává'] }), b = await contact();
    assert.deepEqual((await bulk({ action: 'untag', tag, target: { ids: [a.id, b.id] } })).body, { matched: 2, changed: 1 });
    assert.deepEqual(await tagsOf(a.id), ['Zůstává']);
    assert.deepEqual((await bulk({ action: 'untag', tag: uniq('Neexistuje'), target: { ids: [a.id] } })).body, { matched: 1, changed: 0 });
  });

  it('změna fáze posune verzi, takže otevřený formulář dostane konflikt; časová osa nese předchozí fázi', async () => {
    const a = await contact({ stage: 'lead' }), b = await contact({ stage: 'client' });
    assert.deepEqual((await bulk({ action: 'stage', stage: 'client', target: { ids: [a.id, b.id] } })).body, { matched: 2, changed: 1 });
    const m = await ctx.as('member');
    const d = (await m.get(`${base(A)}/contacts/${a.id}`)).body;
    assert.equal(d.stage, 'client'); assert.equal(d.version, 2);
    assert.equal((await m.patch(`${base(A)}/contacts/${a.id}`, { version: 1, city: 'Kolín' })).status, 409);
    assert.equal((await m.get(`${base(A)}/contacts/${b.id}`)).body.version, 1, 'beze změny zůstává verze');
    const acts = (await m.get(`${base(A)}/contacts/${a.id}/activities`)).body.items;
    assert.equal(acts[0].title, 'Fáze změněna na Klient'); assert.match(acts[0].detail, /Předtím: Lead/);
  });

  it('mazat smí jen správce; smazané zmizí ze seznamu i detailu', async () => {
    const a = await contact(), b = await contact();
    const r = await bulk({ action: 'delete', target: { ids: [a.id, b.id] } }, 'member');
    assert.equal(r.status, 403); assert.equal(r.body.code, 'FORBIDDEN');
    assert.equal((await (await ctx.as('member')).get(`${base(A)}/contacts/${a.id}`)).status, 200, 'po zamítnutí kontakt zůstal');
    assert.deepEqual((await bulk({ action: 'delete', target: { ids: [a.id, b.id] } }, 'manager')).body, { matched: 2, changed: 2 });
    assert.equal((await (await ctx.as('manager')).get(`${base(A)}/contacts/${a.id}`)).status, 404);
    assert.deepEqual((await bulk({ action: 'delete', target: { ids: [a.id] } }, 'manager')).body, { matched: 0, changed: 0 }, 'smazaný se znovu nepočítá');
    assert.equal(await ctx.ownerDb.auditLog.count({ where: { entityId: a.id, action: 'delete' } }), 1);
  });
});

describe('výběr podle filtru', () => {
  it('server zasáhne všechny kontakty podle filtru, ne jen načtenou stránku', async () => {
    const city = uniq('Filtrov'), tag = uniq('Pofiltru');
    const all = [];
    for (let i = 0; i < 30; i++) all.push(await contact({ city }));
    const other = await contact();
    const r = await bulk({ action: 'tag', tag, target: { filter: { q: city.toUpperCase() } } });
    assert.deepEqual(r.body, { matched: 30, changed: 30 });
    const list = (await (await ctx.as('member')).get(`${base(A)}/contacts?tag=${encodeURIComponent(tag)}&limit=100`)).body;
    assert.equal(list.total, 30); assert.equal(list.items.some((c: any) => c.id === other.id), false);
    assert.deepEqual((await bulk({ action: 'stage', stage: 'prospect', target: { filter: { tag, stage: 'lead' } } })).body, { matched: 30, changed: 30 });
  });
});

describe('oddělení prostorů a validace', () => {
  it('cizí ID se nezapočítají a cizí kontakt se nezmění', async () => {
    const foreign = await contact({}, B, 'outsider');
    const tag = uniq('Utok');
    assert.deepEqual((await bulk({ action: 'tag', tag, target: { ids: [foreign.id] } }, 'manager')).body, { matched: 0, changed: 0 });
    assert.deepEqual((await bulk({ action: 'delete', target: { ids: [foreign.id] } }, 'manager')).body, { matched: 0, changed: 0 });
    const f = (await (await ctx.as('outsider')).get(`${base(B)}/contacts/${foreign.id}`)).body;
    assert.deepEqual(f.tags, []); assert.equal(f.version, 1);
    assert.equal((await bulk({ action: 'tag', tag, target: { filter: {} } }, 'manager', B)).status, 404, 'cizí prostor odpovídá jako neexistující');
    // A filter in A never reaches B's contacts.
    await bulk({ action: 'tag', tag, target: { filter: { q: 'Hromadný Kontakt' } } }, 'manager');
    assert.deepEqual((await (await ctx.as('outsider')).get(`${base(B)}/contacts/${foreign.id}`)).body.tags, []);
  });

  it('neplatný požadavek odmítne česky', async () => {
    const a = await contact();
    const cases: [unknown, RegExp][] = [
      [{ action: 'tag', target: { ids: [a.id] } }, /štítek/],
      [{ action: 'stage', target: { ids: [a.id] } }, /fázi/],
      [{ action: 'stage', stage: 'vip', target: { ids: [a.id] } }, /./],
      [{ action: 'tag', tag: 'X', target: { ids: [] } }, /aspoň jeden/],
      [{ action: 'tag', tag: 'X', target: { ids: ['1; drop table'] } }, /Neplatné ID/],
      [{ action: 'tag', tag: 'X', target: { ids: Array.from({ length: 501 }, () => a.id) } }, /nejvýše 500/],
      [{ action: 'archive', target: { ids: [a.id] } }, /Neznámá/],
      [{ action: 'tag', tag: 'X', target: { ids: [a.id], filter: {} } }, /./],
    ];
    for (const [body, msg] of cases) {
      const r = await bulk(body);
      assert.equal(r.status, 422, JSON.stringify(body).slice(0, 80)); assert.match(r.body.message, msg);
    }
  });
});
