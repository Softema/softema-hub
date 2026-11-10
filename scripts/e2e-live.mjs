// End-to-end tests of the database version on a throwaway database: builds the live web app, starts it with the API, runs Playwright.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { start, stop } from './processes.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');
const pg = createRequire(new URL('../packages/db/package.json', import.meta.url))('pg');
const swap = (url, db) => { const u = new URL(url); u.pathname = `/${db}`; return u.href; };
const DB = 'softema_hub_e2e';
const admin = new pg.Client({ connectionString: swap(process.env.DATABASE_OWNER_URL, 'postgres') });
await admin.connect();
await admin.query(`drop database if exists ${DB} with (force)`);
await admin.query(`create database ${DB}`);
await admin.end();
const shell = process.platform === 'win32';
const port = process.env.E2E_PORT ?? '3000', apiPort = process.env.E2E_API_PORT ?? '4200';
const origin = `http://localhost:${port}`;
// E-mails of this run (invitations, password reset) land here; the tests read the links from them.
const outbox = resolve('apps/web/test-results-live/outbox');
rmSync(outbox, { recursive: true, force: true });
const env = { ...process.env, NODE_ENV: 'production', NEXT_PUBLIC_APP_MODE: 'live', API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`, API_PORT: apiPort, WEB_ORIGIN: origin, AUTH_RATE_LIMIT_MAX: '1000', E2E_BASE_URL: origin, MAIL_OUTBOX_DIR: outbox, E2E_OUTBOX: outbox,
  DATABASE_OWNER_URL: swap(process.env.DATABASE_OWNER_URL, DB), DATABASE_APP_URL: swap(process.env.DATABASE_APP_URL, DB), DATABASE_AUTH_URL: swap(process.env.DATABASE_AUTH_URL, DB) };
const run = (args, extra = {}) => { const r = spawnSync('pnpm', args, { stdio: 'inherit', env: { ...env, ...extra }, shell }); if (r.status) process.exit(r.status); };
run(['--filter', '@softema/db', 'run', 'setup'], { NODE_ENV: 'development' });
run(['--filter', '@softema/web', 'run', 'build']);
const api = start(['--filter', '@softema/api', 'exec', 'tsx', 'src/main.ts'], env);
const web = start(['--filter', '@softema/web', 'exec', 'next', 'start', '--port', port], env);
const up = async url => { for (let i = 0; i < 80; i++) { try { const r = await fetch(url); if (r.status < 500) return; } catch { /* not yet */ } await new Promise(r => setTimeout(r, 250)); } throw new Error(`Nenaběhlo: ${url}`); };
let code = 1;
try {
  await up(`http://127.0.0.1:${apiPort}/api/health`); await up(`${origin}/prihlaseni`);
  const r = spawnSync('pnpm', ['--filter', '@softema/web', 'exec', 'playwright', 'test', '-c', 'e2e-live/playwright.config.ts', ...process.argv.slice(2)], { stdio: 'inherit', env, shell });
  code = r.status ?? 1;
} finally { stop(api); stop(web); }
process.exit(code);
