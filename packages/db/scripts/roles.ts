// Gives the restricted roles created by the migration their login passwords. Run as the owner role.
import pg from 'pg';
import { required } from './env';

const client = new pg.Client({ connectionString: required('DATABASE_OWNER_URL') });
await client.connect();
for (const [role, env] of [['hub_app', 'DATABASE_APP_PASSWORD'], ['hub_auth', 'DATABASE_AUTH_PASSWORD']] as const) {
  const password = (await client.query('select quote_literal($1) as q', [required(env)])).rows[0].q as string;
  await client.query(`alter role ${role} login password ${password}`);
}
await client.end();
console.log('Role hub_app a hub_auth jsou připravené.');
