import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { createClient } from '@softema/db';
import { createApp } from '../src/bootstrap';
import { loadConfig } from '../src/config';

export const WORKSPACE_A = '20000000-0000-4000-8000-00000000000a';
export const WORKSPACE_B = '20000000-0000-4000-8000-00000000000b';
const PASSWORD = process.env.SEED_USER_PASSWORD!;
const ORIGIN = 'http://localhost:3000';
export const USERS = { admin: 'agentura@softema-hub.example', manager: 'spravce@softema-hub.example', member: 'clen@softema-hub.example', outsider: 'cizi@softema-hub.example' } as const;

export interface Res<T = any> { status: number; body: T }
export class Client {
  cookie = '';
  constructor(readonly base: string) {}
  async req<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res<T>> {
    const res = await fetch(this.base + path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(method === 'GET' ? {} : { origin: ORIGIN }), ...(this.cookie ? { cookie: this.cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.getSetCookie().find(c => c.includes('session_token'));
    if (set) this.cookie = set.split(';')[0];
    const text = await res.text();
    let parsed: unknown = text; try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, body: parsed as T };
  }
  get<T = any>(p: string) { return this.req<T>('GET', p); }
  post<T = any>(p: string, b?: unknown) { return this.req<T>('POST', p, b ?? {}); }
  patch<T = any>(p: string, b: unknown) { return this.req<T>('PATCH', p, b); }
  del<T = any>(p: string) { return this.req<T>('DELETE', p); }
  signIn(email: string, password = PASSWORD) { return this.post('/api/auth/sign-in/email', { email, password }); }
}

export interface Ctx { app: INestApplication; base: string; as: (u: keyof typeof USERS) => Promise<Client>; ownerDb: ReturnType<typeof createClient>; close: () => Promise<void> }
export async function start(env: Record<string, string> = {}): Promise<Ctx> {
  const app = await createApp(loadConfig({ ...process.env, NODE_ENV: 'test', ...env }));
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const ownerDb = createClient(process.env.DATABASE_OWNER_URL!, 2);
  const clients = new Map<string, Client>();
  return {
    app, base, ownerDb,
    as: async u => { let c = clients.get(u); if (!c) { c = new Client(base); const r = await c.signIn(USERS[u]); if (r.status !== 200) throw new Error(`login ${u}: ${r.status}`); clients.set(u, c); } return c; },
    close: async () => { await ownerDb.$disconnect(); await app.close(); },
  };
}
let n = 0;
export const uniqueEmail = (p = 'kontakt') => `${p}-${Date.now().toString(36)}-${++n}@test-firma.example`;
