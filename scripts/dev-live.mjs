// Starts the API and the web app in live mode. Works the same on macOS, Linux and Windows.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!existsSync('.env')) { console.error('Chybí .env. Spusťte: pnpm setup:env'); process.exit(1); }
process.loadEnvFile('.env');
const run = (filter, script, env = {}) => spawn('pnpm', ['--filter', filter, 'run', script], { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } });
const live = { NEXT_PUBLIC_APP_MODE: 'live', API_INTERNAL_URL: `http://127.0.0.1:${process.env.API_PORT ?? 4000}` };
const kids = [run('@softema/api', 'dev'), run('@softema/web', process.argv[2] === 'start' ? 'start' : 'dev', live)];
const stop = () => kids.forEach(k => k.kill());
process.on('SIGINT', stop); process.on('SIGTERM', stop);
kids.forEach(k => k.on('exit', code => { stop(); process.exitCode = code ?? 0; }));
