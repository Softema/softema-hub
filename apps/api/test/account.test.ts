// Accounts and team: 2FA, password reset, invitations, member management. Fictional data on the throwaway test database.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { totp } from '@softema/db/seed-auth';
import { Client, type Ctx, linkToken, start, uniqueEmail, USERS, WORKSPACE_A as A, WORKSPACE_B as B } from './helpers';

const PASSWORD = 'Nove-heslo-pro-test-2026';
let ctx: Ctx;
// Many sign-ins from one address; the limits themselves are covered by rate-limit.test.ts.
before(async () => { ctx = await start({ AUTH_RATE_LIMIT_MAX: '1000' }); });
after(async () => { await ctx.close(); });

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** The raw secret from Better-Auth's otpauth URI (base32 of the UTF-8 secret). */
function secretFromUri(uri: string) {
  const s = new URL(uri).searchParams.get('secret')!;
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of s) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out).toString('utf8');
}

/** An administrator invites `email` into the workspace; returns the token from the e-mail. */
async function invite(by: keyof typeof USERS, ws: string, email: string, role: 'member' | 'workspace_admin' = 'member') {
  const r = await (await ctx.as(by)).post(`/api/v1/workspaces/${ws}/invitations`, { email, role });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return linkToken(ctx.mail.last(email)?.text);
}
/** A brand-new account through an invitation; returns a signed-in client. */
async function newcomer(role: 'member' | 'workspace_admin' = 'member', ws = A, by: keyof typeof USERS = 'manager') {
  const email = uniqueEmail('novy');
  const token = await invite(by, ws, email, role);
  const accepted = await new Client(ctx.base).post('/api/v1/invitations/accept', { token, name: 'Nováček Testovací', password: PASSWORD });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const c = new Client(ctx.base);
  assert.equal((await c.signIn(email, PASSWORD)).status, 200);
  const id = (await c.get('/api/v1/me')).body.user.id as string;
  return { c, email, id };
}

describe('dvoufázové ověření', () => {
  it('správce se samotným heslem nepřihlásí, špatný kód neprojde', async () => {
    const c = new Client(ctx.base);
    const r = await c.signIn(USERS.manager);
    assert.equal(r.status, 200); assert.equal(r.body.twoFactorRedirect, true);
    assert.equal((await c.get('/api/v1/me')).status, 401);
    assert.equal((await c.post('/api/auth/two-factor/verify-totp', { code: '000000' })).status, 401);
    assert.equal((await c.get('/api/v1/me')).status, 401);
    assert.equal((await c.signInFully(USERS.manager)).status, 200);
    const me = (await c.get('/api/v1/me')).body;
    assert.equal(me.user.twoFactorEnabled, true); assert.equal(me.user.twoFactorRequired, true);
  });

  it('člen se přihlásí heslem a 2FA povinnou nemá', async () => {
    const c = new Client(ctx.base);
    const r = await c.signIn(USERS.member);
    assert.equal(r.body.twoFactorRedirect, undefined);
    const me = (await c.get('/api/v1/me')).body;
    assert.equal(me.user.twoFactorEnabled, false); assert.equal(me.user.twoFactorRequired, false);
  });

  it('nový správce nedostane data, dokud si 2FA nezapne a neověří', async () => {
    const { c, email, id } = await newcomer('workspace_admin');
    const blocked = await c.get(`/api/v1/workspaces/${A}/contacts`);
    assert.equal(blocked.status, 403); assert.equal(blocked.body.code, 'TWO_FACTOR_REQUIRED');
    assert.equal((await c.get('/api/v1/me')).body.user.twoFactorRequired, true);

    assert.equal((await c.post('/api/auth/two-factor/enable', { password: 'spatne-heslo-123456' })).status, 400);
    const en = await c.post('/api/auth/two-factor/enable', { password: PASSWORD });
    assert.equal(en.status, 200); assert.equal(en.body.backupCodes.length, 10);
    assert.equal((await c.get(`/api/v1/workspaces/${A}/contacts`)).status, 403, 'bez ověření kódu se 2FA nezapne');
    const secret = secretFromUri(en.body.totpURI);
    assert.equal((await c.post('/api/auth/two-factor/verify-totp', { code: totp(secret) })).status, 200);
    assert.equal((await c.get(`/api/v1/workspaces/${A}/contacts`)).status, 200);

    // The secret is stored encrypted, never in plain text.
    const row = await ctx.ownerDb.twoFactor.findFirstOrThrow({ where: { userId: id } });
    assert.ok(!row.secret.includes(secret)); assert.ok(!row.backupCodes.includes(en.body.backupCodes[0]));

    // Next sign-in asks for the code; a backup code works exactly once.
    const again = new Client(ctx.base);
    assert.equal((await again.signIn(email, PASSWORD)).body.twoFactorRedirect, true);
    assert.equal((await again.post('/api/auth/two-factor/verify-backup-code', { code: en.body.backupCodes[0] })).status, 200);
    assert.equal((await again.get(`/api/v1/workspaces/${A}/contacts`)).status, 200);
    const reuse = new Client(ctx.base); await reuse.signIn(email, PASSWORD);
    assert.notEqual((await reuse.post('/api/auth/two-factor/verify-backup-code', { code: en.body.backupCodes[0] })).status, 200);
  });
});

describe('obnova hesla', () => {
  it('neznámý e-mail dostane stejnou odpověď a žádný e-mail neodejde', async () => {
    const before = ctx.mail.sent.length;
    const r = await new Client(ctx.base).post('/api/auth/request-password-reset', { email: 'nikdo@nikde.example' });
    assert.equal(r.status, 200);
    assert.equal(ctx.mail.sent.length, before);
  });

  it('odkaz platí jednou, v databázi je jen hash, staré přihlášení skončí', async () => {
    const { c, email } = await newcomer();
    assert.equal((await new Client(ctx.base).post('/api/auth/request-password-reset', { email })).status, 200);
    const mail = ctx.mail.last(email)!;
    assert.match(mail.subject, /nového hesla/);
    const token = linkToken(mail.text);
    const stored = await ctx.ownerDb.verification.findMany({ select: { identifier: true, value: true } });
    assert.ok(stored.every(v => !v.identifier.includes(token) && !v.value.includes(token)), 'token nesmí být v databázi');

    const anon = new Client(ctx.base);
    assert.equal((await anon.post('/api/auth/reset-password', { token, newPassword: 'kratke' })).status, 400);
    assert.equal((await anon.post('/api/auth/reset-password', { token, newPassword: 'Uplne-nove-heslo-2026' })).status, 200);
    assert.equal((await c.get('/api/v1/me')).status, 401, 'původní session se zruší');
    assert.equal((await anon.post('/api/auth/reset-password', { token, newPassword: 'Jeste-jine-heslo-2026' })).status, 400, 'odkaz je jednorázový');
    assert.equal((await new Client(ctx.base).signIn(email, PASSWORD)).status, 401);
    assert.equal((await new Client(ctx.base).signIn(email, 'Uplne-nove-heslo-2026')).status, 200);
  });
});

describe('pozvánky', () => {
  it('člen tým vidí, ale nezve a nespravuje', async () => {
    const m = await ctx.as('member');
    const list = await m.get(`/api/v1/workspaces/${A}/members`);
    assert.equal(list.status, 200);
    assert.ok(list.body.some((u: { email: string; twoFactorEnabled: boolean }) => u.email === USERS.manager && u.twoFactorEnabled));
    assert.equal((await m.get(`/api/v1/workspaces/${A}/invitations`)).status, 403);
    assert.equal((await m.post(`/api/v1/workspaces/${A}/invitations`, { email: uniqueEmail(), role: 'member' })).status, 403);
    assert.equal((await m.patch(`/api/v1/workspaces/${A}/members/seed-manager`, { role: 'member' })).status, 403);
  });

  it('stávajícího člena pozvat nejde, chybný vstup se odmítne', async () => {
    const m = await ctx.as('manager');
    const r = await m.post(`/api/v1/workspaces/${A}/invitations`, { email: USERS.member.toUpperCase(), role: 'member' });
    assert.equal(r.status, 409); assert.equal(r.body.code, 'ALREADY_MEMBER');
    assert.equal((await m.post(`/api/v1/workspaces/${A}/invitations`, { email: uniqueEmail(), role: 'agency_admin' })).status, 422);
  });

  it('náhled, nový účet a jednorázové přijetí; v databázi je jen hash', async () => {
    const email = uniqueEmail('pozvany');
    const token = await invite('manager', A, email);
    const row = await ctx.ownerDb.invitation.findFirstOrThrow({ where: { emailNormalized: email } });
    assert.notEqual(row.tokenHash, token); assert.equal(row.tokenHash.length, 64);
    const anon = new Client(ctx.base);
    const p = await anon.post('/api/v1/invitations/preview', { token });
    assert.deepEqual(p.body, { workspaceName: 'Prostor Alfa', email, role: 'member', accountExists: false });
    const missing = await anon.post('/api/v1/invitations/accept', { token });
    assert.equal(missing.status, 422); assert.ok(missing.body.fields.name && missing.body.fields.password);
    assert.equal((await anon.post('/api/v1/invitations/accept', { token, name: 'Pozvaný', password: 'kratke' })).status, 422);
    const ok = await anon.post('/api/v1/invitations/accept', { token, name: 'Pozvaný Testovací', password: PASSWORD });
    assert.deepEqual(ok.body, { workspaceId: A, email, accountCreated: true });
    assert.equal((await anon.post('/api/v1/invitations/accept', { token, name: 'Znovu', password: PASSWORD })).status, 410);
    assert.equal((await anon.post('/api/v1/invitations/preview', { token })).status, 410);
    const c = new Client(ctx.base); await c.signIn(email, PASSWORD);
    assert.equal((await c.get('/api/v1/me')).body.workspaces[0].role, 'member');
    assert.equal((await c.get(`/api/v1/workspaces/${A}/contacts`)).status, 200);
    assert.equal(await ctx.ownerDb.auditLog.count({ where: { action: 'invitation.accept', workspaceId: A } }) > 0, true);
  });

  it('nová pozvánka zneplatní starou; zrušená a prošlá nefungují', async () => {
    const email = uniqueEmail('neplatna');
    const first = await invite('manager', A, email);
    const second = await invite('manager', A, email);
    const anon = new Client(ctx.base);
    assert.equal((await anon.post('/api/v1/invitations/preview', { token: first })).status, 410);
    const list = (await (await ctx.as('manager')).get(`/api/v1/workspaces/${A}/invitations`)).body as { id: string; email: string }[];
    const pending = list.filter(i => i.email === email);
    assert.equal(pending.length, 1);
    assert.equal((await (await ctx.as('manager')).del(`/api/v1/workspaces/${A}/invitations/${pending[0].id}`)).status, 204);
    assert.equal((await anon.post('/api/v1/invitations/preview', { token: second })).status, 410);
    const third = await invite('manager', A, email);
    await ctx.ownerDb.invitation.updateMany({ where: { emailNormalized: email, revokedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await anon.post('/api/v1/invitations/accept', { token: third, name: 'X', password: PASSWORD })).status, 410);
    assert.equal((await new Client(ctx.base).post('/api/v1/invitations/preview', { token: 'x'.repeat(43) })).status, 410);
  });

  it('cizí správce nevidí ani neruší pozvánky jiného prostoru', async () => {
    await invite('manager', A, uniqueEmail('cizi-test'));
    const o = await ctx.as('outsider');
    assert.equal((await o.get(`/api/v1/workspaces/${A}/invitations`)).status, 404);
    const id = (await (await ctx.as('manager')).get(`/api/v1/workspaces/${A}/invitations`)).body[0].id;
    assert.equal((await o.del(`/api/v1/workspaces/${B}/invitations/${id}`)).status, 404);
  });

  it('existující účet přijímá pozvánku přihlášený a jen pod svým e-mailem', async () => {
    const { c, email } = await newcomer('member', B, 'outsider');
    const token = await invite('manager', A, email);
    const anon = new Client(ctx.base);
    assert.equal((await anon.post('/api/v1/invitations/preview', { token })).body.accountExists, true);
    const signIn = await anon.post('/api/v1/invitations/accept', { token, name: 'Převzetí', password: 'Utocnikovo-heslo-2026' });
    assert.equal(signIn.status, 409); assert.equal(signIn.body.code, 'SIGN_IN_REQUIRED');
    assert.equal((await (await ctx.as('member')).post('/api/v1/invitations/accept', { token })).status, 403);
    assert.equal((await new Client(ctx.base).signIn(email, 'Utocnikovo-heslo-2026')).status, 401, 'heslo se nezměnilo');
    const ok = await c.post('/api/v1/invitations/accept', { token });
    assert.deepEqual(ok.body, { workspaceId: A, email, accountCreated: false });
    const ids = (await c.get('/api/v1/me')).body.workspaces.map((w: { id: string }) => w.id).sort();
    assert.deepEqual(ids, [A, B].sort());
  });

  it('pozvánku nelze přijmout z cizího původu', async () => {
    const r = await new Client(ctx.base).req('POST', '/api/v1/invitations/preview', { token: 'x'.repeat(43) }, { origin: 'https://zly-web.example' });
    assert.equal(r.status, 403); assert.equal(r.body.code, 'BAD_ORIGIN');
  });
});

describe('správa členů', () => {
  it('správce mění role a odebírá; odebraný ztratí přístup hned', async () => {
    const { c, id } = await newcomer();
    const m = await ctx.as('manager');
    const changed = await m.patch(`/api/v1/workspaces/${A}/members/${id}`, { role: 'workspace_admin' });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.find((u: { id: string }) => u.id === id).role, 'workspace_admin');
    assert.equal((await c.get('/api/v1/me')).body.workspaces[0].role, 'workspace_admin');
    assert.equal((await c.get(`/api/v1/workspaces/${A}/contacts`)).body.code, 'TWO_FACTOR_REQUIRED', 'nová role správce vyžaduje 2FA');
    assert.equal((await m.patch(`/api/v1/workspaces/${A}/members/${id}`, { role: 'member' })).status, 200);
    assert.equal((await c.get(`/api/v1/workspaces/${A}/contacts`)).status, 200);
    assert.equal((await m.del(`/api/v1/workspaces/${A}/members/${id}`)).status, 204);
    assert.equal((await c.get(`/api/v1/workspaces/${A}/contacts`)).status, 404);
    assert.deepEqual((await c.get('/api/v1/me')).body.workspaces, []);
    assert.equal(await ctx.ownerDb.auditLog.count({ where: { action: { in: ['member.role', 'member.remove'] }, entityId: id } }), 3);
  });

  it('vlastní roli ani členství měnit nejde; cizí prostor nejde spravovat', async () => {
    const m = await ctx.as('manager');
    assert.equal((await m.patch(`/api/v1/workspaces/${A}/members/seed-manager`, { role: 'member' })).status, 409);
    assert.equal((await m.del(`/api/v1/workspaces/${A}/members/seed-manager`)).status, 409);
    assert.equal((await m.del(`/api/v1/workspaces/${A}/members/neexistuje`)).status, 404);
    const o = await ctx.as('outsider');
    assert.equal((await o.patch(`/api/v1/workspaces/${A}/members/seed-member`, { role: 'workspace_admin' })).status, 404);
    assert.equal((await o.patch(`/api/v1/workspaces/${B}/members/seed-member`, { role: 'workspace_admin' })).status, 404, 'člen z A není v B');
    const me = (await (await ctx.as('member')).get('/api/v1/me')).body;
    assert.equal(me.workspaces.find((w: { id: string }) => w.id === A).role, 'member');
  });

  it('správce agentury spravuje tým i bez členství v prostoru', async () => {
    const { id } = await newcomer('member', B, 'outsider');
    const a = await ctx.as('admin');
    assert.equal((await a.patch(`/api/v1/workspaces/${B}/members/${id}`, { role: 'workspace_admin' })).status, 200);
    assert.equal((await a.del(`/api/v1/workspaces/${B}/members/${id}`)).status, 204);
  });
});
