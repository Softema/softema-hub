// Fictional, disposable data: one agency, two workspaces, four users. Safe to run repeatedly.
// E-mail domains use the reserved `.example` TLD.
import { hash } from '@node-rs/argon2';
import { symmetricEncrypt } from 'better-auth/crypto';
import { normalizeEmail, normalizeSearch } from '@softema/shared';
import { createClient, withTenant } from '../src/index';
import { seedTotpSecret } from '../src/seed-auth';
import { required } from './env';

const AGENCY = '10000000-0000-4000-8000-000000000001';
export const WORKSPACE_A = '20000000-0000-4000-8000-00000000000a';
export const WORKSPACE_B = '20000000-0000-4000-8000-00000000000b';
const USERS = [
  { id: 'seed-admin', name: 'Alena Agenturní', email: 'agentura@softema-hub.example' },
  { id: 'seed-manager', name: 'Petr Správce', email: 'spravce@softema-hub.example' },
  { id: 'seed-member', name: 'Marta Členová', email: 'clen@softema-hub.example' },
  { id: 'seed-outsider', name: 'Karel Cizí', email: 'cizi@softema-hub.example' },
] as const;
const CONTACTS: [string, string, string, string, 'lead' | 'prospect' | 'client', string[]][] = [
  ['Jiří Šťastný', 'jiri.stastny@posta.example', 'Šťastný a syn', 'Olomouc', 'client', ['VIP', 'Newsletter']],
  ['Božena Čermáková', 'bozena@cermakova.example', 'Ateliér Čermáková', 'Brno', 'prospect', ['Newsletter']],
  ['Žaneta Říhová', 'zaneta@rihova.example', '', 'Praha', 'lead', ['Webinář']],
  ['Ondřej Dvořák', 'ondrej@dvorak-stavby.example', 'Dvořák stavby', 'Ostrava', 'client', []],
  ['Tereza Nováková', 'tereza@novakova.example', 'Novákovi s.r.o.', 'Plzeň', 'lead', ['Newsletter', 'Webinář']],
];

// Administrators must have 2FA (zadání 6.1), so the seed gives them a TOTP secret. `pnpm totp` prints the current code.
const ADMINS: readonly string[] = ['seed-admin', 'seed-manager', 'seed-outsider'];

const owner = createClient(required('DATABASE_OWNER_URL'), 2);
const app = createClient(required('DATABASE_APP_URL'), 2);
const seedPassword = required('SEED_USER_PASSWORD');
const password = await hash(seedPassword, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
// Encrypted exactly like Better-Auth's two-factor plugin does with a single BETTER_AUTH_SECRET.
const authSecret = required('BETTER_AUTH_SECRET');
const twoFactor = { secret: await symmetricEncrypt({ key: authSecret, data: seedTotpSecret(seedPassword) }), backupCodes: await symmetricEncrypt({ key: authSecret, data: '[]' }), verified: true, failedVerificationCount: 0, lockedUntil: null };

for (const u of USERS) {
  const twoFactorEnabled = ADMINS.includes(u.id);
  await owner.user.upsert({ where: { id: u.id }, create: { ...u, emailVerified: true, twoFactorEnabled }, update: { name: u.name, email: u.email, twoFactorEnabled } });
  await owner.account.upsert({ where: { id: `acc-${u.id}` }, create: { id: `acc-${u.id}`, accountId: u.id, providerId: 'credential', userId: u.id, password }, update: { password } });
  if (twoFactorEnabled) await owner.twoFactor.upsert({ where: { id: `tf-${u.id}` }, create: { id: `tf-${u.id}`, userId: u.id, ...twoFactor }, update: twoFactor });
  else await owner.twoFactor.deleteMany({ where: { userId: u.id } });
}
await owner.agency.upsert({ where: { id: AGENCY }, create: { id: AGENCY, name: 'Softema (ukázka)' }, update: {} });
await owner.workspace.upsert({ where: { id: WORKSPACE_A }, create: { id: WORKSPACE_A, agencyId: AGENCY, name: 'Prostor Alfa', kind: 'internal' }, update: {} });
await owner.workspace.upsert({ where: { id: WORKSPACE_B }, create: { id: WORKSPACE_B, agencyId: AGENCY, name: 'Prostor Beta', kind: 'client' }, update: {} });
await owner.agencyMembership.upsert({ where: { agencyId_userId: { agencyId: AGENCY, userId: 'seed-admin' } }, create: { agencyId: AGENCY, userId: 'seed-admin' }, update: {} });
for (const [workspaceId, userId, role] of [[WORKSPACE_A, 'seed-manager', 'workspace_admin'], [WORKSPACE_A, 'seed-member', 'member'], [WORKSPACE_B, 'seed-outsider', 'workspace_admin']] as const) {
  await owner.workspaceMembership.upsert({ where: { workspaceId_userId: { workspaceId, userId } }, create: { workspaceId, userId, role }, update: { role } });
}

// Tenant data goes through the application role, so the seed obeys the same RLS as the API.
await withTenant(app, { userId: 'seed-manager', workspaceId: WORKSPACE_A }, async tx => {
  for (const [name, email, company, city, stage, tags] of CONTACTS) {
    const emailNormalized = normalizeEmail(email);
    if (await tx.contact.findFirst({ where: { workspaceId: WORKSPACE_A, emailNormalized, deletedAt: null }, select: { id: true } })) continue;
    const c = await tx.contact.create({ data: { workspaceId: WORKSPACE_A, name, email, emailNormalized, company, city, stage, source: 'Ukázková data', ownerUserId: 'seed-manager' }, select: { id: true } });
    for (const tag of tags) {
      const nameNormalized = normalizeSearch(tag);
      await tx.tag.createMany({ data: { workspaceId: WORKSPACE_A, name: tag, nameNormalized }, skipDuplicates: true });
      const t = await tx.tag.findUniqueOrThrow({ where: { workspaceId_nameNormalized: { workspaceId: WORKSPACE_A, nameNormalized } }, select: { id: true } });
      await tx.contactTag.create({ data: { workspaceId: WORKSPACE_A, contactId: c.id, tagId: t.id } });
    }
    await tx.activity.create({ data: { workspaceId: WORKSPACE_A, contactId: c.id, actorUserId: 'seed-manager', type: 'contact', payload: { title: 'Kontakt přidán do databáze', detail: 'Zdroj: Ukázková data' } } });
  }
});
await withTenant(app, { userId: 'seed-outsider', workspaceId: WORKSPACE_B }, async tx => {
  const email = 'hana.beta@beta-klient.example';
  if (await tx.contact.findFirst({ where: { workspaceId: WORKSPACE_B, emailNormalized: email, deletedAt: null }, select: { id: true } })) return;
  await tx.contact.create({ data: { workspaceId: WORKSPACE_B, name: 'Hana Betová', email, emailNormalized: email, company: 'Beta klient', city: 'Liberec', stage: 'client', source: 'Ukázková data', ownerUserId: 'seed-outsider' } });
});
await owner.$disconnect(); await app.$disconnect();
console.log('Seed je hotový: 2 prostory, 4 uživatelé, 6 smyšlených kontaktů.');
for (const u of USERS) console.log(`  ${u.email}${ADMINS.includes(u.id) ? ' (dvoufázové ověření, kód vypíše pnpm totp)' : ''}`);
