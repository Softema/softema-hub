// Deployed behind the Vercel proxy: without the shared secret the API answers nothing but its health check.
import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { Client, type Ctx, start, USERS } from './helpers';

const SECRET = 'test-proxy-secret-'.padEnd(48, 'x');
let ctx: Ctx;
before(async () => { ctx = await start({ HUB_PROXY_SECRET: SECRET }); });
after(async () => { await ctx.close(); });

it('bez tajného klíče proxy nic neprojde, ani přihlášení', async () => {
  const c = new Client(ctx.base);
  for (const r of [await c.signIn(USERS.member), await c.get('/api/v1/me'), await c.req('POST', '/api/v1/invitations/preview', { token: 'x'.repeat(43) }, { 'x-hub-proxy': 'spatny-klic' })]) {
    assert.equal(r.status, 403); assert.equal(r.body.code, 'BAD_ORIGIN');
  }
  assert.equal((await c.get('/api/health')).status, 200, 'zdravotní kontrola zůstává pro server');
});

it('se správným klíčem funguje přihlášení i API', async () => {
  const c = new Client(ctx.base);
  const h = { 'x-hub-proxy': SECRET };
  assert.equal((await c.req('POST', '/api/auth/sign-in/email', { email: USERS.member, password: process.env.SEED_USER_PASSWORD }, h)).status, 200);
  assert.equal((await c.req('GET', '/api/v1/me', undefined, h)).status, 200);
});

it('IP návštěvníka bere z hlavičky od proxy, ne z adresy Vercelu', async () => {
  const c = new Client(ctx.base);
  const h = { 'x-hub-proxy': SECRET, 'x-hub-client-ip': '198.51.100.7', 'x-forwarded-for': '3.70.132.135' };
  assert.equal((await c.req('POST', '/api/auth/sign-in/email', { email: USERS.member, password: process.env.SEED_USER_PASSWORD }, h)).status, 200);
  const sessions = (await c.req('GET', '/api/v1/me/sessions', undefined, h)).body as { current: boolean; ipAddress: string }[];
  assert.equal(sessions.find(s => s.current)?.ipAddress, '198.51.100.7');
});

it('odpovědi API se nesmí ukládat do mezipaměti prohlížeče ani CDN', async () => {
  const c = new Client(ctx.base);
  const h = { 'x-hub-proxy': SECRET };
  assert.equal((await c.req('POST', '/api/auth/sign-in/email', { email: USERS.member, password: process.env.SEED_USER_PASSWORD }, h)).status, 200);
  for (const path of ['/api/v1/me', '/api/v1/me/sessions', '/api/auth/get-session']) {
    const res = await fetch(ctx.base + path, { headers: { ...h, cookie: c.cookie } });
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get('cache-control'), 'no-store', path);
  }
});

it('v produkci API bez tajného klíče nenastartuje', async () => {
  await assert.rejects(() => start({ NODE_ENV: 'production', HUB_PROXY_SECRET: '' }), /HUB_PROXY_SECRET/);
});
