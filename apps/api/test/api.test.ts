// Integration tests: real HTTP against a real PostgreSQL with the restricted roles (zadání kap. 14).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client, type Ctx, start, uniqueEmail, USERS, WORKSPACE_A as A, WORKSPACE_B as B } from './helpers';

let ctx: Ctx;
before(async () => { ctx = await start(); });
after(async () => { await ctx.close(); });
const contacts = (ws: string) => `/api/v1/workspaces/${ws}/contacts`;
const make = async (who: 'manager' | 'member' | 'outsider' = 'manager', ws = A, extra = {}) => {
  const c = await ctx.as(who); const r = await c.post(contacts(ws), { name: 'Testovací Kontakt', email: uniqueEmail(), ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body;
};

describe('přihlášení a session', () => {
  it('bez session API odmítne', async () => {
    const c = new Client(ctx.base);
    assert.equal((await c.get('/api/v1/me')).status, 401);
    const r = await c.get(contacts(A)); assert.equal(r.status, 401); assert.equal(r.body.code, 'UNAUTHENTICATED');
  });
  it('správné heslo přihlásí, /me vrátí jen dostupné prostory a role', async () => {
    const me = (await (await ctx.as('member')).get('/api/v1/me')).body;
    assert.equal(me.user.email, USERS.member);
    assert.deepEqual(me.workspaces.map((w: any) => [w.id, w.role]), [[A, 'member']]);
    assert.equal(me.workspaces.some((w: any) => w.id === B), false);
  });
  it('agency_admin vidí oba prostory', async () => {
    const me = (await (await ctx.as('admin')).get('/api/v1/me')).body;
    assert.deepEqual(me.workspaces.map((w: any) => w.role), ['agency_admin', 'agency_admin']);
  });
  it('špatné heslo neprojde a odpověď neprozradí, zda účet existuje', async () => {
    const a = await new Client(ctx.base).signIn(USERS.member, 'spatne-heslo-123456');
    const b = await new Client(ctx.base).signIn('nikdo@nikde.example', 'spatne-heslo-123456');
    assert.equal(a.status, 401); assert.equal(b.status, 401); assert.deepEqual(a.body, b.body);
  });
  it('veřejná registrace je vypnutá', async () => {
    const r = await new Client(ctx.base).post('/api/auth/sign-up/email', { name: 'X', email: uniqueEmail(), password: 'dlouhe-heslo-12345' });
    assert.notEqual(r.status, 200);
  });
  it('odhlášení zneplatní session na serveru', async () => {
    const c = new Client(ctx.base); await c.signIn(USERS.member);
    assert.equal((await c.get('/api/v1/me')).status, 200);
    const old = c.cookie; await c.post('/api/auth/sign-out');
    c.cookie = old; assert.equal((await c.get('/api/v1/me')).status, 401);
  });
  it('zfalšovaná cookie neprojde', async () => {
    const c = new Client(ctx.base); c.cookie = 'better-auth.session_token=abc.def';
    assert.equal((await c.get('/api/v1/me')).status, 401);
  });
  it('heslo je v databázi argon2id', async () => {
    const a = await ctx.ownerDb.account.findFirstOrThrow({ where: { userId: 'seed-member' } });
    assert.match(a.password!, /^\$argon2id\$/);
  });
});

describe('CRUD kontaktů', () => {
  it('vytvoření, detail, úprava, měkké smazání', async () => {
    const m = await ctx.as('manager');
    const c = await make('manager', A, { phone: '+420 777 000 111', company: 'Šťastná firma', stage: 'prospect', tags: ['Nový', 'Nový', 'nový'] });
    assert.equal(c.version, 1); assert.deepEqual(c.tags.map((t: any) => t.name), ['Nový']); assert.equal(c.owner.id, 'seed-manager');
    const u = await m.patch(`${contacts(A)}/${c.id}`, { version: 1, city: 'Zlín', stage: 'client' });
    assert.equal(u.status, 200); assert.equal(u.body.version, 2); assert.equal(u.body.city, 'Zlín');
    assert.equal((await m.del(`${contacts(A)}/${c.id}`)).status, 204);
    assert.equal((await m.get(`${contacts(A)}/${c.id}`)).status, 404);
    const raw = await ctx.ownerDb.contact.findUniqueOrThrow({ where: { id: c.id } });
    assert.ok(raw.deletedAt, 'řádek zůstal jako měkce smazaný');
  });
  it('hledání s diakritikou i bez, stránkování a filtry', async () => {
    const m = await ctx.as('manager');
    for (const q of ['Šťastný', 'stastny', 'STASTNY', 'cermak', 'Čermáková']) {
      const r = await m.get(`${contacts(A)}?q=${encodeURIComponent(q)}`);
      assert.equal(r.status, 200); assert.ok(r.body.total >= 1, q);
    }
    const page = (await m.get(`${contacts(A)}?limit=2&page=1&sort=name`)).body;
    assert.equal(page.items.length, 2); assert.ok(page.total > 2);
    const tag = (await m.get(`${contacts(A)}?tag=VIP`)).body;
    assert.ok(tag.items.every((c: any) => c.tags.some((t: any) => t.name === 'VIP')));
    const stage = (await m.get(`${contacts(A)}?stage=client`)).body;
    assert.ok(stage.items.every((c: any) => c.stage === 'client'));
  });
  it('řazení podle jména je české (Č za C, Š za S)', async () => {
    const m = await ctx.as('manager');
    const names = (await m.get(`${contacts(A)}?q=${encodeURIComponent('seed-razeni')}&sort=name`)).body.items;
    assert.equal(names.length, 0);
    const sorted = (await m.get(`${contacts(A)}?sort=name&limit=100`)).body.items.map((c: any) => c.name as string);
    const idxB = sorted.indexOf('Božena Čermáková'), idxZ = sorted.indexOf('Žaneta Říhová'), idxT = sorted.indexOf('Tereza Nováková');
    assert.ok(idxB < idxT && idxT < idxZ, sorted.join(', '));
  });
  it('validace vrací chyby u polí a neznámá pole odmítne', async () => {
    const m = await ctx.as('manager');
    const r = await m.post(contacts(A), { name: '', email: 'bez-zavinace' });
    assert.equal(r.status, 422); assert.equal(r.body.code, 'VALIDATION_FAILED'); assert.ok(r.body.fields.name); assert.ok(r.body.fields.email);
    const x = await m.post(contacts(A), { name: 'A', email: uniqueEmail(), workspaceId: B, deletedAt: null });
    assert.equal(x.status, 422);
  });
  it('duplicitní e-mail: 409 bez ohledu na velikost písmen, ve vedlejším prostoru povolený, po smazání znovu možný', async () => {
    const m = await ctx.as('manager'); const email = uniqueEmail('dup');
    const a = await m.post(contacts(A), { name: 'První', email }); assert.equal(a.status, 201);
    const b = await m.post(contacts(A), { name: 'Druhý', email: email.toUpperCase() });
    assert.equal(b.status, 409); assert.equal(b.body.code, 'DUPLICATE_EMAIL');
    assert.equal((await (await ctx.as('outsider')).post(contacts(B), { name: 'Vedle', email })).status, 201);
    assert.equal((await m.del(`${contacts(A)}/${a.body.id}`)).status, 204);
    assert.equal((await m.post(contacts(A), { name: 'Znovu', email })).status, 201);
  });
  it('souběžné vytvoření stejného e-mailu projde jen jednou', async () => {
    const m = await ctx.as('manager'); const email = uniqueEmail('race');
    const rs = await Promise.all(Array.from({ length: 6 }, () => m.post(contacts(A), { name: 'Souběh', email })));
    assert.deepEqual(rs.map(r => r.status).sort(), [201, 409, 409, 409, 409, 409]);
  });
  it('úprava na e-mail jiného kontaktu vrátí 409', async () => {
    const m = await ctx.as('manager'); const a = await make(); const b = await make();
    const r = await m.patch(`${contacts(A)}/${b.id}`, { version: 1, email: a.email });
    assert.equal(r.status, 409); assert.equal(r.body.code, 'DUPLICATE_EMAIL');
  });
  it('vlastník musí být členem prostoru', async () => {
    const m = await ctx.as('manager'); const c = await make();
    const r = await m.patch(`${contacts(A)}/${c.id}`, { version: 1, ownerId: 'seed-outsider' });
    assert.equal(r.status, 422); assert.ok(r.body.fields.ownerId);
    assert.equal((await m.patch(`${contacts(A)}/${c.id}`, { version: 1, ownerId: 'seed-member' })).body.owner.name, 'Marta Členová');
  });
});

describe('sdílení ve stejném prostoru a oprávnění', () => {
  it('kontakt jednoho člena okamžitě vidí a upraví druhý', async () => {
    const manager = await ctx.as('manager'), member = await ctx.as('member');
    const c = await make('manager');
    assert.equal((await member.get(`${contacts(A)}/${c.id}`)).body.email, c.email);
    const u = await member.patch(`${contacts(A)}/${c.id}`, { version: 1, company: 'Upravil člen' });
    assert.equal(u.status, 200);
    assert.equal((await manager.get(`${contacts(A)}/${c.id}`)).body.company, 'Upravil člen');
    const note = await member.post(`${contacts(A)}/${c.id}/notes`, { body: 'Poznámka od člena' });
    const back = (await manager.get(`${contacts(A)}/${c.id}`)).body.notes[0];
    assert.equal(back.id, note.body.id); assert.equal(back.author.name, 'Marta Členová');
  });
  it('dva lidé nepřepíšou změny tiše: starší verze dostane 409', async () => {
    const manager = await ctx.as('manager'), member = await ctx.as('member'); const c = await make();
    assert.equal((await manager.patch(`${contacts(A)}/${c.id}`, { version: 1, city: 'Brno' })).status, 200);
    const stale = await member.patch(`${contacts(A)}/${c.id}`, { version: 1, city: 'Praha' });
    assert.equal(stale.status, 409); assert.equal(stale.body.code, 'VERSION_CONFLICT');
    assert.equal((await manager.get(`${contacts(A)}/${c.id}`)).body.city, 'Brno');
  });
  it('člen vytváří a upravuje, ale nesmí mazat; správce agentury smí', async () => {
    const member = await ctx.as('member'); const c = await make('member');
    const r = await member.del(`${contacts(A)}/${c.id}`);
    assert.equal(r.status, 403); assert.equal(r.body.code, 'FORBIDDEN');
    assert.equal((await member.get(`${contacts(A)}/${c.id}`)).status, 200);
    assert.equal((await (await ctx.as('admin')).del(`${contacts(A)}/${c.id}`)).status, 204);
  });
});

describe('zákaz přístupu do cizího prostoru přes přímé API volání', () => {
  it('seznam cizího prostoru je 404 a neliší se od neexistujícího', async () => {
    const o = await ctx.as('outsider');
    const a = await o.get(contacts(A)); const b = await o.get(contacts('20000000-0000-4000-8000-0000000000ff'));
    assert.equal(a.status, 404); assert.deepEqual(a.body, b.body);
    assert.equal((await o.get(contacts('neni-uuid'))).status, 404);
  });
  it('žádná operace nad cizím kontaktem neprojde, ani s cizím ID přes vlastní prostor', async () => {
    const o = await ctx.as('outsider'); const c = await make('manager');
    const paths = [`${contacts(A)}/${c.id}`, `${contacts(B)}/${c.id}`];
    for (const p of paths) {
      assert.equal((await o.get(p)).status, 404, p);
      assert.equal((await o.patch(p, { version: 1, name: 'Hack' })).status, 404, p);
      assert.equal((await o.del(p)).status, 404, p);
      assert.equal((await o.post(`${p}/notes`, { body: 'x' })).status, 404, p);
      assert.equal((await o.post(`${p}/tags`, { name: 'x' })).status, 404, p);
      assert.equal((await o.get(`${p}/activities`)).status, 404, p);
    }
    const raw = await ctx.ownerDb.contact.findUniqueOrThrow({ where: { id: c.id } });
    assert.equal(raw.name, c.name); assert.equal(raw.deletedAt, null); assert.equal(raw.version, 1);
  });
  it('podvržené workspaceId v těle je odmítnuto', async () => {
    const o = await ctx.as('outsider');
    assert.equal((await o.post(contacts(B), { name: 'X', email: uniqueEmail(), workspaceId: A })).status, 422);
  });
  it('štítek z cizího prostoru nejde použít', async () => {
    const o = await ctx.as('outsider'), m = await ctx.as('manager'); const mine = await make('outsider', B); const c = await make('manager', A, { tags: ['Tajný'] });
    assert.equal((await o.del(`${contacts(B)}/${mine.id}/tags/${c.tags[0].id}`)).status, 404);
    assert.ok(!(await o.get(`/api/v1/workspaces/${B}/tags`)).body.some((t: any) => t.name === 'Tajný'));
    assert.equal((await m.get(`${contacts(A)}/${c.id}`)).body.tags.length, 1);
  });
  it('členové cizího prostoru nejsou vidět', async () => {
    assert.equal((await (await ctx.as('outsider')).get(`/api/v1/workspaces/${A}/members`)).status, 404);
  });
});

describe('štítky, poznámky, historie, audit', () => {
  it('štítky: založení, sdílení v prostoru, odebrání', async () => {
    const m = await ctx.as('manager'); const a = await make(); const b = await make();
    const t = await m.post(`${contacts(A)}/${a.id}/tags`, { name: 'Sdílený štítek' }); assert.equal(t.status, 201);
    const same = await m.post(`${contacts(A)}/${b.id}/tags`, { name: 'SDÍLENÝ ŠTÍTEK' }); assert.equal(same.body.id, t.body.id);
    assert.equal((await m.del(`${contacts(A)}/${a.id}/tags/${t.body.id}`)).status, 204);
    assert.equal((await m.get(`${contacts(A)}/${a.id}`)).body.tags.length, 0);
    assert.equal((await m.get(`${contacts(A)}/${b.id}`)).body.tags.length, 1);
  });
  it('poznámky: přidání, úprava, měkké smazání', async () => {
    const m = await ctx.as('manager'); const c = await make();
    const n = (await m.post(`${contacts(A)}/${c.id}/notes`, { body: 'Původní' })).body;
    assert.equal((await m.patch(`${contacts(A)}/${c.id}/notes/${n.id}`, { body: 'Nová' })).body.body, 'Nová');
    assert.equal((await m.del(`${contacts(A)}/${c.id}/notes/${n.id}`)).status, 204);
    assert.equal((await m.get(`${contacts(A)}/${c.id}`)).body.notes.length, 0);
    assert.ok((await ctx.ownerDb.note.findUniqueOrThrow({ where: { id: n.id } })).deletedAt);
  });
  it('časová osa zapisuje změny, do historie nejdou hodnoty osobních údajů', async () => {
    const m = await ctx.as('manager'); const c = await make();
    await m.patch(`${contacts(A)}/${c.id}`, { version: 1, phone: '+420 111 222 333', stage: 'client' });
    await m.post(`${contacts(A)}/${c.id}/tags`, { name: 'Historie' });
    await m.post(`${contacts(A)}/${c.id}/notes`, { body: 'Citlivý text poznámky' });
    const items = (await m.get(`${contacts(A)}/${c.id}/activities`)).body.items;
    const titles = items.map((i: any) => i.title);
    for (const t of ['Kontakt přidán do databáze', 'Kontakt upraven', 'Fáze změněna na Klient', 'Přidán štítek Historie', 'Přidána interní poznámka']) assert.ok(titles.includes(t), t);
    const json = JSON.stringify(items); assert.ok(!json.includes('+420 111') && !json.includes('Citlivý'));
    const audit = await ctx.ownerDb.auditLog.findMany({ where: { entityId: c.id } });
    assert.ok(audit.some(a => a.action === 'update' && a.changedFields.includes('phone')));
    assert.ok(!JSON.stringify(audit).includes('+420 111'));
  });
  it('čtení detailu se zapisuje do auditu', async () => {
    const member = await ctx.as('member'); const c = await make();
    await member.get(`${contacts(A)}/${c.id}`);
    assert.ok(await ctx.ownerDb.auditLog.findFirst({ where: { entityId: c.id, action: 'read', actorUserId: 'seed-member' } }));
  });
});

describe('CSRF a chybové odpovědi', () => {
  it('změna z cizího originu je odmítnuta i s platnou session', async () => {
    const m = await ctx.as('manager');
    const r = await m.req('POST', contacts(A), { name: 'X', email: uniqueEmail() }, { origin: 'https://zla-stranka.example' });
    assert.equal(r.status, 403); assert.equal(r.body.code, 'BAD_ORIGIN');
    const c = await make();
    assert.equal((await m.req('DELETE', `${contacts(A)}/${c.id}`, undefined, { origin: 'https://zla-stranka.example' })).status, 403);
  });
  it('neznámá adresa vrací jednotný tvar chyby', async () => {
    const r = await (await ctx.as('manager')).get('/api/v1/neexistuje');
    assert.equal(r.status, 404); assert.equal(r.body.code, 'NOT_FOUND');
  });
  it('zdravotní kontrola nepotřebuje session', async () => { assert.equal((await new Client(ctx.base).get('/api/health')).status, 200); });
});
