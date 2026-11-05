import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(import.meta.dirname, '../../../.env');
if (existsSync(file)) process.loadEnvFile(file);

export function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Chybí proměnná ${name}. Spusťte pnpm setup:env.`);
  return v;
}
