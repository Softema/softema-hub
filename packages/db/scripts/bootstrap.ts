// First administrator of a fresh database (online deployment). Never creates fictional seed data.
//
//   BOOTSTRAP_EMAIL=jana@firma.cz pnpm --filter @softema/db run bootstrap
//
// 1st run: creates the agency and its first workspace and prints a one-time invitation link (workspace admin).
//          Open it, choose your name and password, then turn on 2FA. No e-mail is needed for this.
// 2nd run, after accepting: makes the account an agency administrator (all workspaces of the agency).
// Safe to run repeatedly. Optional: BOOTSTRAP_AGENCY, BOOTSTRAP_WORKSPACE (names), WEB_ORIGIN (link base).
import { createHash, randomBytes } from 'node:crypto';
import { normalizeEmail } from '@softema/shared';
import { createClient } from '../src/index';
import { required } from './env';

const email = normalizeEmail(required('BOOTSTRAP_EMAIL'));
const agencyName = process.env.BOOTSTRAP_AGENCY?.trim() || 'Softema';
const workspaceName = process.env.BOOTSTRAP_WORKSPACE?.trim() || 'Softema';
const origin = required('WEB_ORIGIN').replace(/\/$/, '');
const db = createClient(required('DATABASE_OWNER_URL'), 1);

try {
  const agency = (await db.agency.findFirst({ orderBy: { createdAt: 'asc' } })) ?? (await db.agency.create({ data: { name: agencyName } }));
  const workspace = (await db.workspace.findFirst({ where: { agencyId: agency.id }, orderBy: { createdAt: 'asc' } }))
    ?? (await db.workspace.create({ data: { agencyId: agency.id, name: workspaceName, kind: 'internal' } }));
  const user = await db.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true, name: true } });

  if (user) {
    await db.agencyMembership.upsert({ where: { agencyId_userId: { agencyId: agency.id, userId: user.id } }, create: { agencyId: agency.id, userId: user.id }, update: {} });
    console.log(`${user.name} (${email}) je správcem agentury ${agency.name} a vidí všechny její prostory.`);
  } else {
    const token = randomBytes(32).toString('base64url');
    await db.invitation.updateMany({ where: { workspaceId: workspace.id, emailNormalized: email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    await db.invitation.create({ data: {
      workspaceId: workspace.id, email, emailNormalized: email, role: 'workspace_admin',
      tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 7 * 86_400_000),
    } });
    console.log(`Agentura „${agency.name}“, prostor „${workspace.name}“.`);
    console.log(`Odkaz pro ${email} (platí 7 dní, jen jednou, nikomu ho neposílejte):\n\n  ${origin}/pozvanka#${token}\n`);
    console.log('Po přijetí pozvánky spusťte tento příkaz znovu, aby se z účtu stal správce agentury.');
  }
} finally {
  await db.$disconnect();
}
