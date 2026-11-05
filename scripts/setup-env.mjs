// Creates .env from .env.example with random local secrets. Never overwrites an existing file.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

if (existsSync('.env')) { console.log('.env už existuje, nic neměním. Heslo testovacích uživatelů je v SEED_USER_PASSWORD.'); process.exit(0); }
const secret = (n = 24) => randomBytes(n).toString('hex');
const owner = secret(), app = secret(), auth = secret(), seed = `Hub-${secret(6)}`;
const text = readFileSync('.env.example', 'utf8')
  .replace(/^POSTGRES_PASSWORD=$/m, `POSTGRES_PASSWORD=${owner}`)
  .replace(/^DATABASE_APP_PASSWORD=$/m, `DATABASE_APP_PASSWORD=${app}`)
  .replace(/^DATABASE_AUTH_PASSWORD=$/m, `DATABASE_AUTH_PASSWORD=${auth}`)
  .replace(/^BETTER_AUTH_SECRET=$/m, `BETTER_AUTH_SECRET=${secret(32)}`)
  .replace(/^SEED_USER_PASSWORD=$/m, `SEED_USER_PASSWORD=${seed}`)
  .replace('softema_owner:<heslo>', `softema_owner:${owner}`).replace('hub_app:<heslo>', `hub_app:${app}`).replace('hub_auth:<heslo>', `hub_auth:${auth}`);
writeFileSync('.env', text, { mode: 0o600 });
console.log(`.env vytvořen. Heslo testovacích uživatelů: ${seed}`);
