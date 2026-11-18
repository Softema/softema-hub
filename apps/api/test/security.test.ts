// Sign-in lock after repeated wrong passwords and management of signed-in devices. Fresh fictional accounts only,
// so the seed users are never locked for the other test files.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { LOGIN_LOCK } from '@softema/shared';
import { Client, type Ctx, linkToken, start, uniqueEmail, WORKSPACE_A as A } from './helpers';

const PASSWORD = 'Heslo-pro-test-zamku-2026';
const WRONG = 'spatne-heslo-123456';
let ctx: Ctx;
// Many sign-ins from one address; the per-IP limit is covered by rate-limit.test.ts.
before(async () => { ctx = await start({ AUTH_RATE_LIMIT_MAX: '1000' }); });
after(async () => { await ctx.close(); });

/** A new member account through an invitation. */
async function account() {
  const email = uniqueEmail('zamek');
  const r = await (await ctx.as('manager')).post(`/api/v1/workspaces/${A}/invitations`, { email, role: 'member' });
  assert.equal(r.status, 201);
  const accepted = await new Client(ctx.base).post('/api/v1/invitations/accept', { token: linkToken(ctx.mail.last(email)?.text), name: 'Testovací Zámek', password: PASSWORD });
  assert.equal(accepted.status, 200);
  return email;
}
const signIn = (email: string, password = PASSWORD) => new Client(ctx.base).signIn(email, password);

describe('zámek po opakovaně špatném hesle', () => {
  it(`po ${LOGIN_LOCK.attempts} chybách se účet zamkne i pro správné heslo`, async () => {
    const email = await account();
    for (let i = 0; i < LOGIN_LOCK.attempts; i++) assert.equal((await signIn(email, WRONG)).status, 401);
    const locked = await signIn(email);
    assert.equal(locked.status, 429); assert.equal(locked.body.code, 'ACCOUNT_LOCKED');
    // After the lock expires the account works again.
    await ctx.ownerDb.loginLock.update({ where: { emailNormalized: email }, data: { lockedUntil: new Date(Date.now() - 1000), lastFailedAt: new Date(Date.now() - 16 * 60_000) } });
    assert.equal((await signIn(email)).status, 200);
  });

  it('správné heslo počítadlo vynuluje', async () => {
    const email = await account();
    for (let i = 0; i < LOGIN_LOCK.attempts - 1; i++) await signIn(email, WRONG);
    assert.equal((await signIn(email)).status, 200);
    assert.equal(await ctx.ownerDb.loginLock.count({ where: { emailNormalized: email } }), 0);
    for (let i = 0; i < LOGIN_LOCK.attempts - 1; i++) assert.equal((await signIn(email, WRONG)).status, 401);
    assert.equal((await signIn(email)).status, 200);
  });

  it('neexistující adresa se chová stejně, takže zámek neprozradí, kdo má účet', async () => {
    const email = uniqueEmail('neexistuje');
    for (let i = 0; i < LOGIN_LOCK.attempts; i++) assert.equal((await signIn(email, WRONG)).status, 401);
    assert.equal((await signIn(email, WRONG)).body.code, 'ACCOUNT_LOCKED');
  });

  it('obnova hesla zámek zruší', async () => {
    const email = await account();
    for (let i = 0; i < LOGIN_LOCK.attempts; i++) await signIn(email, WRONG);
    assert.equal((await signIn(email)).status, 429);
    await new Client(ctx.base).post('/api/auth/request-password-reset', { email });
    const token = linkToken(ctx.mail.last(email)?.text);
    assert.equal((await new Client(ctx.base).post('/api/auth/reset-password', { token, newPassword: 'Nove-heslo-po-zamku-2026' })).status, 200);
    assert.equal((await signIn(email, 'Nove-heslo-po-zamku-2026')).status, 200);
  });
});

describe('přihlášená zařízení', () => {
  it('seznam bez tokenů, odhlášení jiného zařízení i všech ostatních', async () => {
    const email = await account();
    const [a, b, c] = [new Client(ctx.base), new Client(ctx.base), new Client(ctx.base)];
    for (const x of [a, b, c]) assert.equal((await x.signIn(email, PASSWORD)).status, 200);
    const list = (await a.get('/api/v1/me/sessions')).body as { id: string; current: boolean }[];
    assert.equal(list.length, 3); assert.equal(list[0].current, true); assert.equal(list.filter(s => s.current).length, 1);
    assert.ok(!JSON.stringify(list).includes('token'), 'odpověď nesmí obsahovat token relace');

    const otherOfB = (await b.get('/api/v1/me/sessions')).body.find((s: { current: boolean }) => s.current).id as string;
    assert.equal((await a.del(`/api/v1/me/sessions/${otherOfB}`)).status, 204);
    assert.equal((await b.get('/api/v1/me')).status, 401, 'odhlášené zařízení ztratí přístup hned');
    assert.equal((await a.del(`/api/v1/me/sessions/${list[0].id}`)).status, 409, 'vlastní zařízení se ukončuje odhlášením');

    assert.equal((await a.del('/api/v1/me/sessions')).body.revoked, 1);
    assert.equal((await c.get('/api/v1/me')).status, 401);
    assert.equal((await a.get('/api/v1/me')).status, 200);
  });

  it('cizí relaci nejde vidět ani ukončit', async () => {
    const m = await ctx.as('member');
    const mine = (await m.get('/api/v1/me/sessions')).body.find((s: { current: boolean }) => s.current).id as string;
    const other = new Client(ctx.base); await other.signIn(await account(), PASSWORD);
    assert.ok(!(await other.get('/api/v1/me/sessions')).body.some((s: { id: string }) => s.id === mine));
    assert.equal((await other.del(`/api/v1/me/sessions/${mine}`)).status, 404);
    assert.equal((await m.get('/api/v1/me')).status, 200);
  });
});
