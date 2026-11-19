// Segments: saved contact filters evaluated on the server (zadání 8.2). Other test files add contacts to the same
// workspaces, so every test works with its own unique tag, city or field values and counts only those.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createClient, withTenant } from '@softema/db';
import { type Ctx, start, uniqueEmail, WORKSPACE_A as A, WORKSPACE_B as B } from './helpers';

let ctx: Ctx;
before(async () => { ctx = await start(); });
after(async () => { await ctx.close(); });
const base = (ws: string) => `/api/v1/workspaces/${ws}`;
let n = 0;
const uniq = (p: string) => `${p}-${Date.now().toString(36)}-${++n}`;
const contact = async (extra: Record<string, unknown>, ws = A, who: 'manager' | 'outsider' = 'manager') => {
  const r = await (await ctx.as(who)).post(`${base(ws)}/contacts`, { name: 'Segmentový Kontakt', email: uniqueEmail('seg'), ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body;
};
const preview = async (body: unknown, ws = A, who: 'manager' | 'member' | 'outsider' = 'manager') => (await ctx.as(who)).post(`${base(ws)}/segments/preview`, body);

describe('vyhodnocení pravidel na serveru', () => {
  it('štítek, město bez ohledu na diakritiku, fáze, firma a kombinace vše / aspoň jedno', async () => {
    const tag = uniq('Štítek'), city = uniq('Brno-Žabovřesky');
    const a = await contact({ tags: [tag], city, stage: 'client', company: 'Šťastná Kancelář' });
    const b = await contact({ tags: [tag], city: uniq('Jinde'), stage: 'lead' });
    await contact({ city, stage: 'lead' });
    const cityAscii = city.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

    let r = await preview({ rules: [{ field: 'tag', op: 'is', value: tag.toLowerCase() }] });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.total, 2);
    r = await preview({ match: 'all', rules: [{ field: 'tag', op: 'is', value: tag }, { field: 'city', op: 'is', value: cityAscii }] });
    assert.equal(r.body.total, 1); assert.deepEqual(r.body.sample.map((m: any) => m.id), [a.id]); assert.deepEqual(r.body.ruleCounts, [2, 2]);
    r = await preview({ match: 'any', rules: [{ field: 'tag', op: 'is', value: tag }, { field: 'city', op: 'is', value: city }] });
    assert.equal(r.body.total, 3);
    r = await preview({ match: 'all', rules: [{ field: 'tag', op: 'is', value: tag }, { field: 'stage', op: 'isNot', value: 'client' }] });
    assert.deepEqual(r.body.sample.map((m: any) => m.id), [b.id]);
    r = await preview({ match: 'all', rules: [{ field: 'tag', op: 'is', value: tag }, { field: 'company', op: 'contains', value: 'stastna' }] });
    assert.deepEqual(r.body.sample.map((m: any) => m.id), [a.id]);
    r = await preview({ match: 'all', rules: [{ field: 'tag', op: 'contains', value: tag.slice(0, -2) }, { field: 'company', op: 'isNot', value: 'šťastná' }] });
    assert.deepEqual(r.body.sample.map((m: any) => m.id), [b.id]);
  });

  it('vlastní pole podle názvu bez ohledu na velikost písmen, "není" zahrne i kontakty bez pole', async () => {
    const tag = uniq('Pole');
    const a = await contact({ tags: [tag], customFields: { Obor: 'Účetnictví a daně' } });
    const b = await contact({ tags: [tag], customFields: { obor: 'Stavebnictví' } });
    const c = await contact({ tags: [tag] });
    const within = (rule: unknown) => preview({ match: 'all', rules: [{ field: 'tag', op: 'is', value: tag }, rule] });
    const ids = (r: any) => r.body.sample.map((m: any) => m.id).sort();
    assert.deepEqual(ids(await within({ field: 'customField', key: 'OBOR', op: 'is', value: 'ucetnictvi a dane' })), [a.id]);
    assert.deepEqual(ids(await within({ field: 'customField', key: 'Obor', op: 'contains', value: 'stav' })), [b.id]);
    assert.deepEqual(ids(await within({ field: 'customField', key: 'Obor', op: 'isNot', value: 'Stavebnictví' })), [a.id, c.id].sort());
  });

  it('stáří kontaktu a smazané kontakty se nepočítají', async () => {
    const tag = uniq('Nove');
    const a = await contact({ tags: [tag] });
    const d = await contact({ tags: [tag] });
    assert.equal((await (await ctx.as('manager')).del(`${base(A)}/contacts/${d.id}`)).status, 204);
    const r = await preview({ match: 'all', rules: [{ field: 'tag', op: 'is', value: tag }, { field: 'createdDays', op: 'lessThan', value: '7' }] });
    assert.equal(r.body.total, 1); assert.equal(r.body.sample[0].id, a.id);
    await ctx.ownerDb.contact.update({ where: { id: a.id }, data: { createdAt: new Date(Date.now() - 30 * 86_400_000) } });
    assert.equal((await preview({ match: 'all', rules: [{ field: 'tag', op: 'is', value: tag }, { field: 'createdDays', op: 'lessThan', value: '7' }] })).body.total, 0);
  });

  it('hodnoty jsou parametry, ne SQL ani vzor LIKE', async () => {
    const tag = uniq('Bezpecnost');
    await contact({ tags: [tag], city: 'Praha' });
    for (const value of ["' or 1=1 --", '%', '_', "x'); drop table hub.segment; --"]) {
      const r = await preview({ rules: [{ field: 'city', op: 'contains', value }, { field: 'tag', op: 'is', value: tag }], match: 'all' });
      assert.equal(r.status, 200, value); assert.equal(r.body.total, 0, value);
    }
    assert.equal((await (await ctx.as('manager')).get(`${base(A)}/segments`)).status, 200);
  });

  it('neplatná pravidla odmítne česky', async () => {
    const bad = [
      [{ field: 'stage', op: 'contains', value: 'lead' }, /nejde použít/],
      [{ field: 'stage', op: 'is', value: 'vip' }, /Neznámá fáze/],
      [{ field: 'createdDays', op: 'lessThan', value: '0' }, /Počet dní/],
      [{ field: 'createdDays', op: 'lessThan', value: '1 day' }, /Počet dní/],
      [{ field: 'customField', op: 'is', value: 'x' }, /Vyberte vlastní pole/],
      [{ field: 'tag', op: 'is', value: '' }, /Doplňte hodnoty/],
      [{ field: 'email', op: 'is', value: 'x' }, /Neznámé pole/],
    ] as const;
    for (const [rule, msg] of bad) {
      const r = await preview({ rules: [rule] });
      assert.equal(r.status, 422, JSON.stringify(rule)); assert.match(r.body.message, msg);
    }
    const many = Array.from({ length: 21 }, () => ({ field: 'tag', op: 'is', value: 'x' }));
    assert.equal((await preview({ rules: many })).status, 422);
  });
});

describe('uložené segmenty', () => {
  it('vytvoření, seznam s živým počtem, úprava s kontrolou verze, smazání nechá kontakty', async () => {
    const m = await ctx.as('member');
    const tag = uniq('Ulozeny');
    const c1 = await contact({ tags: [tag] });
    const name = uniq('Aktivní klienti');
    const r = await m.post(`${base(A)}/segments`, { name, description: 'Pro newsletter', rules: [{ field: 'tag', op: 'is', value: tag }] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const s = r.body;
    assert.equal(s.count, 1); assert.equal(s.version, 1); assert.equal(s.createdBy.id, 'seed-member'); assert.equal(s.match, 'all');

    await contact({ tags: [tag] });
    const list = (await m.get(`${base(A)}/segments`)).body;
    assert.equal(list.find((x: any) => x.id === s.id).count, 2, 'počet se počítá z aktuálních dat');

    const dup = await m.post(`${base(A)}/segments`, { name: name.toUpperCase(), rules: [] });
    assert.equal(dup.status, 409); assert.equal(dup.body.code, 'DUPLICATE_NAME');

    const u = await m.patch(`${base(A)}/segments/${s.id}`, { version: 1, name, rules: [{ field: 'tag', op: 'is', value: tag }, { field: 'stage', op: 'is', value: 'client' }] });
    assert.equal(u.status, 200, JSON.stringify(u.body)); assert.equal(u.body.version, 2); assert.equal(u.body.count, 0);
    // Fields left out stay as they are; above all, missing rules do not turn into "all contacts".
    const renamed = await m.patch(`${base(A)}/segments/${s.id}`, { version: 2, name: name + ' B' });
    assert.equal(renamed.status, 200); assert.equal(renamed.body.description, 'Pro newsletter'); assert.equal(renamed.body.rules.length, 2); assert.equal(renamed.body.count, 0);
    const stale = await m.patch(`${base(A)}/segments/${s.id}`, { version: 1, name, rules: [] });
    assert.equal(stale.status, 409); assert.equal(stale.body.code, 'VERSION_CONFLICT');

    const audit = await ctx.ownerDb.auditLog.findMany({ where: { entity: 'segment', entityId: s.id }, orderBy: { createdAt: 'asc' } });
    assert.deepEqual(audit.map(a => a.action), ['segment.create', 'segment.update', 'segment.update']); assert.deepEqual(audit[1].changedFields, ['rules']); assert.deepEqual(audit[2].changedFields, ['name']);

    assert.equal((await m.del(`${base(A)}/segments/${s.id}`)).status, 204);
    assert.equal((await m.get(`${base(A)}/segments/${s.id}`)).status, 404);
    assert.equal((await m.get(`${base(A)}/contacts/${c1.id}`)).status, 200, 'kontakt zůstal');
  });

  it('segment bez pravidel obsahuje všechny živé kontakty prostoru', async () => {
    const m = await ctx.as('manager');
    const total = (await m.get(`${base(A)}/contacts?limit=1`)).body.total;
    const r = await m.post(`${base(A)}/segments`, { name: uniq('Všichni'), rules: [] });
    assert.equal(r.status, 201); assert.equal(r.body.count, total);
  });

  it('poškozená pravidla v databázi neodpovídají nikomu, ne všem', async () => {
    const m = await ctx.as('manager');
    const s = (await m.post(`${base(A)}/segments`, { name: uniq('Poškozený'), rules: [{ field: 'tag', op: 'is', value: 'x' }] })).body;
    await ctx.ownerDb.segment.update({ where: { id: s.id }, data: { rules: [{ field: 'neznamé' }] } });
    const d = (await m.get(`${base(A)}/segments/${s.id}`)).body;
    assert.equal(d.count, 0); assert.deepEqual(d.rules, []);
    const r = await m.patch(`${base(A)}/segments/${s.id}`, { version: d.version, name: d.name + ' X' });
    assert.equal(r.body.count, 0, 'přejmenování poškozená pravidla nenahradí prázdnými');
    assert.deepEqual((await ctx.ownerDb.segment.findUniqueOrThrow({ where: { id: s.id } })).rules, [{ field: 'neznamé' }]);
  });
});

describe('oddělení prostorů', () => {
  it('segment cizího prostoru nejde číst, upravit, smazat ani vyhodnotit', async () => {
    const tagB = uniq('Beta');
    await contact({ tags: [tagB] }, B, 'outsider');
    const o = await ctx.as('outsider');
    const sB = (await o.post(`${base(B)}/segments`, { name: uniq('Segment B'), rules: [{ field: 'tag', op: 'is', value: tagB }] })).body;
    assert.equal(sB.count, 1);

    const m = await ctx.as('manager');
    assert.equal((await m.get(`${base(B)}/segments`)).status, 404, 'cizí prostor odpovídá jako neexistující');
    assert.equal((await m.get(`${base(B)}/segments/${sB.id}`)).status, 404);
    assert.equal((await m.post(`${base(B)}/segments/preview`, { rules: [] })).status, 404);
    // Through the user's own workspace: the id of a foreign segment does not exist there.
    assert.equal((await m.get(`${base(A)}/segments/${sB.id}`)).status, 404);
    assert.equal((await m.patch(`${base(A)}/segments/${sB.id}`, { version: 1, name: 'Ukradený', rules: [] })).status, 404);
    assert.equal((await m.del(`${base(A)}/segments/${sB.id}`)).status, 404);
    assert.equal((await m.get(`${base(A)}/segments`)).body.some((x: any) => x.id === sB.id), false);
    // The same rule evaluated in A never counts B's contact.
    assert.equal((await preview({ rules: [{ field: 'tag', op: 'is', value: tagB }] })).body.total, 0);
    assert.equal((await o.get(`${base(B)}/segments/${sB.id}`)).body.name, sB.name, 'segment zůstal beze změny');
  });

  it('RLS: aplikace bez kontextu prostoru segmenty nevidí ani je nezapíše do cizího prostoru', async () => {
    const db = createClient(process.env.DATABASE_APP_URL!, 2);
    try {
      assert.equal(await withTenant(db, { userId: 'seed-manager', workspaceId: B }, tx => tx.segment.count()), 0, 'správce A v kontextu B nic nevidí');
      await assert.rejects(() => withTenant(db, { userId: 'seed-manager', workspaceId: A }, tx => tx.segment.create({ data: { workspaceId: B, name: 'X', nameNormalized: uniq('x') } })), /row-level security|violates/i);
      const [f] = await ctx.ownerDb.$queryRaw<{ f: boolean }[]>`select relforcerowsecurity f from pg_class where oid = 'hub.segment'::regclass`;
      assert.equal(f.f, true);
    } finally { await db.$disconnect(); }
  });
});
