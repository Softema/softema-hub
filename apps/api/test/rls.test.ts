// Database-level isolation: what happens if the API layer has a bug. Connects directly as the application role.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createClient, type PrismaClient, withTenant } from '@softema/db';
import { WORKSPACE_A as A, WORKSPACE_B as B } from './helpers';

let app: PrismaClient, auth: PrismaClient, owner: PrismaClient, contactA: string;
before(async () => {
  app = createClient(process.env.DATABASE_APP_URL!, 8); auth = createClient(process.env.DATABASE_AUTH_URL!, 2); owner = createClient(process.env.DATABASE_OWNER_URL!, 2);
  contactA = (await withTenant(app, { userId: 'seed-manager', workspaceId: A }, tx => tx.contact.findFirstOrThrow({ select: { id: true } }))).id;
});
after(async () => { await Promise.all([app.$disconnect(), auth.$disconnect(), owner.$disconnect()]); });
const asOutsider = <T,>(ws: string, fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, { userId: 'seed-outsider', workspaceId: ws }, fn);
const denied = async (f: () => Promise<unknown>) => assert.rejects(f, /permission denied|row-level security|violates/i);

describe('role', () => {
  it('aplikace běží pod rolí bez BYPASSRLS, není vlastník ani superuser', async () => {
    const [r] = await app.$queryRaw<{ u: string; b: boolean; s: boolean }[]>`select current_user u, rolbypassrls b, rolsuper s from pg_roles where rolname = current_user`;
    assert.deepEqual(r, { u: 'hub_app', b: false, s: false });
    const [t] = await owner.$queryRaw<{ o: string; f: boolean }[]>`select tableowner o, (select relforcerowsecurity from pg_class where oid = 'hub.contact'::regclass) f from pg_tables where schemaname = 'hub' and tablename = 'contact'`;
    assert.notEqual(t.o, 'hub_app'); assert.equal(t.f, true);
  });
  it('všechny tabulky s workspace_id mají RLS', async () => {
    const rows = await owner.$queryRaw<{ t: string; rls: boolean }[]>`select c.relname t, c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid where n.nspname = 'hub' and c.relkind = 'r' and a.attname = 'workspace_id'`;
    assert.ok(rows.length >= 6); for (const r of rows) assert.equal(r.rls, true, r.t);
  });
  it('aplikace nečte hesla ani session, auth role nečte kontakty', async () => {
    await denied(() => app.$queryRaw`select password from hub.account`);
    await denied(() => app.$queryRaw`select token from hub.session`);
    await denied(() => auth.$queryRaw`select name from hub.contact`);
    assert.equal((await app.$queryRaw<unknown[]>`select id, name, email from hub."user"`).length > 0, true);
  });
  it('tvrdé mazání kontaktů a změna historie jsou zakázané', async () => {
    await denied(() => withTenant(app, { userId: 'seed-manager', workspaceId: A }, tx => tx.$executeRaw`delete from hub.contact where id = ${contactA}::uuid`));
    await denied(() => withTenant(app, { userId: 'seed-manager', workspaceId: A }, tx => tx.$executeRaw`update hub.activity set type = 'x'`));
    await denied(() => withTenant(app, { userId: 'seed-manager', workspaceId: A }, tx => tx.$executeRaw`delete from hub.audit_log`));
  });
  it('aplikace nemůže měnit členství ani si přidat roli', async () => {
    await denied(() => withTenant(app, { userId: 'seed-outsider', workspaceId: B }, tx => tx.$executeRaw`insert into hub.workspace_membership (workspace_id, user_id, role) values (${A}::uuid, 'seed-outsider', 'workspace_admin')`));
    await denied(() => withTenant(app, { userId: 'seed-outsider', workspaceId: B }, tx => tx.$executeRaw`update hub.workspace_membership set role = 'workspace_admin'`));
    await denied(() => withTenant(app, { userId: 'seed-outsider', workspaceId: B }, tx => tx.$executeRaw`insert into hub.invitation (workspace_id, email, email_normalized, role, token_hash, expires_at) values (${A}::uuid, 'x@x.example', 'x@x.example', 'member', 'x', now() + interval '1 day')`));
  });
  it('databázové funkce týmu odmítnou člena i cizího správce, i když je API zavolá', async () => {
    const call = (userId: string, ws: string) => withTenant(app, { userId, workspaceId: ws }, async tx => ({
      invite: (await tx.$queryRaw<{ r: { status: string } }[]>`select hub.invite_member(${ws}::uuid, 'utok@x.example', 'workspace_admin', ${'h' + userId}, now() + interval '1 day') r`)[0].r.status,
      role: (await tx.$queryRaw<{ r: string }[]>`select hub.set_member_role(${ws}::uuid, 'seed-member', 'workspace_admin') r`)[0].r,
      remove: (await tx.$queryRaw<{ r: string }[]>`select hub.remove_member(${ws}::uuid, 'seed-manager') r`)[0].r,
    }));
    assert.deepEqual(await call('seed-member', A), { invite: 'forbidden', role: 'forbidden', remove: 'forbidden' });
    assert.deepEqual(await call('seed-outsider', A), { invite: 'forbidden', role: 'forbidden', remove: 'forbidden' });
    const [m] = await owner.$queryRaw<{ role: string }[]>`select role::text from hub.workspace_membership where workspace_id = ${A}::uuid and user_id = 'seed-member'`;
    assert.equal(m.role, 'member');
  });
  it('aplikace nečte hash tokenu pozvánky ani tajemství 2FA, cizí pozvánky nevidí', async () => {
    await denied(() => app.$queryRaw`select token_hash from hub.invitation`);
    await denied(() => app.$queryRaw`select secret from hub."twoFactor"`);
    assert.equal(await withTenant(app, { userId: 'seed-member', workspaceId: A }, tx => tx.invitation.count()), 0, 'člen pozvánky nevidí');
    assert.equal(await asOutsider(A, tx => tx.invitation.count()), 0);
  });
});

describe('izolace i při chybě v API', () => {
  it('bez kontextu nejsou vidět žádná tenant data', async () => {
    assert.equal(await app.contact.count(), 0); assert.equal(await app.workspace.count(), 0); assert.equal(await app.note.count(), 0);
  });
  it('API omylem nastaví cizí workspace: uživatel stále nic nevidí', async () => {
    assert.equal(await asOutsider(A, tx => tx.contact.count()), 0);
    assert.equal(await asOutsider(A, tx => tx.contact.findUnique({ where: { id: contactA } })), null);
    assert.equal(await asOutsider(A, tx => tx.tag.count()), 0);
  });
  it('API zapomene filtr na workspace: RLS vrátí jen vlastní prostor', async () => {
    const rows = await asOutsider(B, tx => tx.contact.findMany({ select: { workspaceId: true } }));
    assert.ok(rows.length >= 1); assert.ok(rows.every(r => r.workspaceId === B));
  });
  it('zápis do cizího prostoru databáze odmítne, cizí řádek nelze změnit', async () => {
    await denied(() => asOutsider(B, tx => tx.contact.create({ data: { workspaceId: A, name: 'X', email: 'x@x.example', emailNormalized: 'x@x.example' } })));
    assert.equal((await asOutsider(B, tx => tx.contact.updateMany({ where: { id: contactA }, data: { name: 'Hack' } }))).count, 0);
  });
  it('přesun kontaktu do jiného prostoru je zakázaný', async () => {
    await denied(() => withTenant(app, { userId: 'seed-admin', workspaceId: A }, tx => tx.contact.update({ where: { id: contactA }, data: { workspaceId: B } })));
  });
  it('složený cizí klíč nedovolí poznámku z prostoru B na kontakt z prostoru A', async () => {
    await assert.rejects(() => withTenant(app, { userId: 'seed-outsider', workspaceId: B }, tx => tx.note.create({ data: { workspaceId: B, contactId: contactA, authorUserId: 'seed-outsider', body: 'x' } })));
  });
  it('kontext neprosákne přes pool při 60 souběžných transakcích', async () => {
    const results = await Promise.all(Array.from({ length: 60 }, (_, i) => i % 2
      ? withTenant(app, { userId: 'seed-manager', workspaceId: A }, tx => tx.contact.findMany({ select: { workspaceId: true } })).then(r => r.every(x => x.workspaceId === A) && r.length > 0)
      : asOutsider(B, tx => tx.contact.findMany({ select: { workspaceId: true } })).then(r => r.every(x => x.workspaceId === B) && r.length > 0)));
    assert.ok(results.every(Boolean)); assert.equal(await app.contact.count(), 0);
  });
});
