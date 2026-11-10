// Integration tests against a throwaway database next to the development one. Never touches softema_hub.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

if (existsSync('.env')) process.loadEnvFile('.env');
const pg = createRequire(new URL('../packages/db/package.json', import.meta.url))('pg');
const swap = (url, db) => { const u = new URL(url); u.pathname = `/${db}`; return u.href; };
const TEST_DB = 'softema_hub_test';
const admin = new pg.Client({ connectionString: swap(process.env.DATABASE_OWNER_URL, 'postgres') });
await admin.connect();
await admin.query(`drop database if exists ${TEST_DB} with (force)`);
await admin.query(`create database ${TEST_DB}`);
await admin.end();
const env = { ...process.env, NODE_ENV: 'test', DATABASE_OWNER_URL: swap(process.env.DATABASE_OWNER_URL, TEST_DB), DATABASE_APP_URL: swap(process.env.DATABASE_APP_URL, TEST_DB), DATABASE_AUTH_URL: swap(process.env.DATABASE_AUTH_URL, TEST_DB) };
const shell = process.platform === 'win32';
const setup = spawnSync('pnpm', ['--filter', '@softema/db', 'run', 'setup'], { stdio: 'inherit', env, shell });
if (setup.status) process.exit(setup.status);
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['test/api.test.ts', 'test/rls.test.ts', 'test/account.test.ts', 'test/rate-limit.test.ts'];
const r = spawnSync('pnpm', ['--filter', '@softema/api', 'exec', 'tsx', '--test', '--test-concurrency=1', ...files], { stdio: 'inherit', env, shell });
process.exit(r.status ?? 1);
