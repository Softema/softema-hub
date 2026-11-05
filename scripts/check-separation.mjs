// Proves that a demo build contains no API code and a live build contains no demo data. Run after building both.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = dir => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; });
const hits = (dir, needle) => files(dir).filter(f => /\.(js|html)$/.test(f) && readFileSync(f, 'utf8').includes(needle));
const checks = [['apps/web/.next/static', ['/api/v1', '/api/auth', 'sign-in/email']], ['apps/web/.next-live/static', ['softema-hub:data', 'createSeed', 'demoWorkspaces']]];
let bad = 0;
for (const [dir, needles] of checks) for (const n of needles) { const h = hits(dir, n); if (h.length) { bad++; console.error(`${dir} obsahuje "${n}": ${h[0]}`); } }
console.log(bad ? 'Oddělení selhalo.' : 'Demo a databázová verze jsou v sestavení oddělené.');
process.exit(bad ? 1 : 0);
