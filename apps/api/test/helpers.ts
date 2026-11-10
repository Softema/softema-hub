import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { createClient } from '@softema/db';
import { seedTotpSecret, totp } from '@softema/db/seed-auth';
import { createApp } from '../src/bootstrap';
import { loadConfig } from '../src/config';
import { MemoryMailer } from '../src/mail/mailer';

export const WORKSPACE_A = '20000000-0000-4000-8000-00000000000a';
export const WORKSPACE_B = '20000000-0000-4000-8000-00000000000b';
const PASSWORD = process.env.SEED_USER_PASSWORD!;
export const SEED_TOTP = seedTotpSecret(PASSWORD);
export const ORIGIN = 'http://localhost:3000';
export const USERS = { admin: 'agentura@softema-hub.example', manager: 'spravce@softema-hub.example', member: 'clen@softema-hub.example', outsider: 'cizi@softema-hub.example' } as const;
/** Seed administrators have 2FA with the secret derived from the seed password (packages/db/src/seed-auth.ts). */
const SEED_2FA = new Set<string>([USERS.admin, USERS.manager, USERS.outsider]);

export interface Res<T = any> { status: number; body: T }
/** HTTP client with a small cookie jar: keeps the session and the short-lived 2FA challenge cookie. */
export class Client {
  readonly jar = new Map<string, string>();
  constructor(readonly base: string) {}
  get cookie() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '); }
  set cookie(header: string) {
    this.jar.clear();
    for (const part of header.split(';')) { const i = part.indexOf('='); if (i > 0) this.jar.set(part.slice(0, i).trim(), part.slice(i + 1)); }
  }
  async req<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res<T>> {
    const res = await fetch(this.base + path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(method === 'GET' ? {} : { origin: ORIGIN }), ...(this.jar.size ? { cookie: this.cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const set of res.headers.getSetCookie()) {
      const [pair, ...attrs] = set.split(';');
      const i = pair.indexOf('='), name = pair.slice(0, i).trim(), value = pair.slice(i + 1);
      if (!value || attrs.some(a => /max-age=0\b/i.test(a.trim()))) this.jar.delete(name); else this.jar.set(name, value);
    }
    const text = await res.text();
    let parsed: unknown = text; try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, body: parsed as T };
  }
  get<T = any>(p: string) { return this.req<T>('GET', p); }
  post<T = any>(p: string, b?: unknown) { return this.req<T>('POST', p, b ?? {}); }
  patch<T = any>(p: string, b: unknown) { return this.req<T>('PATCH', p, b); }
  del<T = any>(p: string) { return this.req<T>('DELETE', p); }
  signIn(email: string, password = PASSWORD) { return this.post('/api/auth/sign-in/email', { email, password }); }
  /** Password, then the TOTP code when the account asks for it. Returns the status of the last step. */
  async signInFully(email: string, password = PASSWORD, totpSecret = SEED_2FA.has(email) ? SEED_TOTP : undefined) {
    const r = await this.signIn(email, password);
    if (r.status !== 200 || !r.body?.twoFactorRedirect) return r;
    if (!totpSecret) throw new Error(`${email} vyžaduje 2FA, ale test nezná klíč`);
    return this.post('/api/auth/two-factor/verify-totp', { code: totp(totpSecret) });
  }
}

export interface Ctx { app: INestApplication; base: string; mail: MemoryMailer; as: (u: keyof typeof USERS) => Promise<Client>; ownerDb: ReturnType<typeof createClient>; close: () => Promise<void> }
export async function start(env: Record<string, string> = {}): Promise<Ctx> {
  const mail = new MemoryMailer();
  const app = await createApp(loadConfig({ ...process.env, NODE_ENV: 'test', ...env }), { mailer: mail });
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const ownerDb = createClient(process.env.DATABASE_OWNER_URL!, 2);
  const clients = new Map<string, Client>();
  return {
    app, base, ownerDb, mail,
    as: async u => { let c = clients.get(u); if (!c) { c = new Client(base); const r = await c.signInFully(USERS[u]); if (r.status !== 200) throw new Error(`login ${u}: ${r.status}`); clients.set(u, c); } return c; },
    close: async () => { await ownerDb.$disconnect(); await app.close(); },
  };
}
let n = 0;
export const uniqueEmail = (p = 'kontakt') => `${p}-${Date.now().toString(36)}-${++n}@test-firma.example`;
/** The one-time token from the link in an e-mail (the part after #). */
export const linkToken = (text: string | undefined) => { const m = text?.match(/#([A-Za-z0-9_-]{20,})/); if (!m) throw new Error('V e-mailu chybí odkaz'); return m[1]; };
