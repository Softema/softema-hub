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
