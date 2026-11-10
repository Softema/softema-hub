import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { Client, type Ctx, start, USERS } from './helpers';

let ctx: Ctx;
before(async () => { ctx = await start({ AUTH_RATE_LIMIT_MAX: '3' }); });
after(async () => { await ctx.close(); });
it('opakované pokusy o přihlášení dostanou 429', async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 5; i++) statuses.push((await new Client(ctx.base).req('POST', '/api/auth/sign-in/email', { email: USERS.member, password: 'spatne-heslo-123456' }, { 'x-forwarded-for': '203.0.113.7' })).status);
  assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
});
it('žádosti o obnovu hesla a ověřovací kódy mají vlastní limit', async () => {
  const reset: number[] = [], codes: number[] = [];
  for (let i = 0; i < 4; i++) reset.push((await new Client(ctx.base).req('POST', '/api/auth/request-password-reset', { email: USERS.member }, { 'x-forwarded-for': '203.0.113.8' })).status);
  for (let i = 0; i < 4; i++) codes.push((await new Client(ctx.base).req('POST', '/api/auth/two-factor/verify-totp', { code: '000000' }, { 'x-forwarded-for': '203.0.113.9' })).status);
  assert.deepEqual(reset, [200, 200, 200, 429]);
  assert.equal(codes[3], 429);
});
