// Starts the API and the web app in live mode. Works the same on macOS, Linux and Windows.
import { existsSync } from 'node:fs';
import { start, stop } from './processes.mjs';

if (!existsSync('.env')) { console.error('Chybí .env. Spusťte: pnpm setup:env'); process.exit(1); }
process.loadEnvFile('.env');
const run = (filter, script, env = {}) => start(['--filter', filter, 'run', script], { ...process.env, ...env });
const live = { NEXT_PUBLIC_APP_MODE: 'live', API_INTERNAL_URL: `http://127.0.0.1:${process.env.API_PORT ?? 4100}` };
const kids = [run('@softema/api', 'dev'), run('@softema/web', process.argv[2] === 'start' ? 'start' : 'dev', live)];
const stopAll = () => kids.forEach(stop);
process.on('SIGINT', stopAll); process.on('SIGTERM', stopAll);
kids.forEach(k => k.on('exit', code => { stopAll(); process.exitCode = code ?? 0; }));
