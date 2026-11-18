// Gives the restricted roles created by the migration their login passwords. Run as the owner role.
//
// A password is set only when the role cannot sign in with the one from the configuration yet. Setting the same
// password again stores a new hash, and Supabase's connection pooler keeps the old one for a while, so a needless
// reset on every deployment made the API's database connections fail for a few minutes.
import pg from 'pg';
import { required } from './env';

async function canSignIn(url: string | undefined) {
  if (!url) return false;
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  try { await c.connect(); await c.query('select 1'); return true; } catch { return false; } finally { await c.end().catch(() => {}); }
}

const owner = new pg.Client({ connectionString: required('DATABASE_OWNER_URL') });
await owner.connect();
const done: string[] = [];
for (const [role, passwordEnv, urlEnv] of [['hub_app', 'DATABASE_APP_PASSWORD', 'DATABASE_APP_URL'], ['hub_auth', 'DATABASE_AUTH_PASSWORD', 'DATABASE_AUTH_URL']] as const) {
  if (await canSignIn(process.env[urlEnv])) { done.push(`${role} beze změny`); continue; }
  const password = (await owner.query('select quote_literal($1) as q', [required(passwordEnv)])).rows[0].q as string;
  await owner.query(`alter role ${role} login password ${password}`);
  done.push(`${role} nastavena`);
}
await owner.end();
console.log(`Role jsou připravené (${done.join(', ')}).`);
