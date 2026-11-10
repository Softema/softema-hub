import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

// Migrations always run as the owner role; the application itself never does.
const envFile = resolve(import.meta.dirname, '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

/**
 * The app (node-postgres) and Prisma's migration engine spell TLS differently. The URLs use the node-postgres form
 * (`sslmode=verify-full&sslrootcert=<ca>`); for migrations it becomes `sslmode=require&sslcert=<ca>&sslaccept=strict`,
 * so the server certificate is still verified against the same CA.
 */
function forMigrations(raw: string) {
  const u = new URL(raw);
  const ca = u.searchParams.get('sslrootcert');
  if (u.searchParams.get('sslmode') !== 'verify-full' || !ca) return raw;
  u.searchParams.delete('sslrootcert');
  u.searchParams.set('sslmode', 'require'); u.searchParams.set('sslcert', ca); u.searchParams.set('sslaccept', 'strict');
  return u.toString();
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: forMigrations(process.env.DATABASE_OWNER_URL ?? 'postgresql://unset@localhost/unset') },
});
