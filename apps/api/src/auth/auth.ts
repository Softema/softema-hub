import { hash, verify } from '@node-rs/argon2';
import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import type { PrismaClient } from '@softema/db';
import { PASSWORD_MIN } from '@softema/shared';
import type { Config } from '../config';
import { type Mailer, renderMail } from '../mail/mailer';

// OWASP baseline for argon2id. Algorithm 2 = Argon2id.
export const ARGON2 = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const RESET_TOKEN_TTL = 60 * 60;

/** Auth runs on its own database role: it can read password hashes and TOTP secrets, the application role cannot. */
export function createAuth(config: Config, db: PrismaClient, mailer: Mailer) {
  const strict = { window: 15 * 60, max: config.AUTH_RATE_LIMIT_MAX };
  return betterAuth({
    appName: 'Softema Hub',
    baseURL: config.WEB_ORIGIN,
    basePath: '/api/auth',
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [config.WEB_ORIGIN],
    database: prismaAdapter(db, { provider: 'postgresql' }),
    // Reset tokens and 2FA challenges are stored only as hashes (zadání 6.1).
    verification: { storeIdentifier: 'hashed' },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // accounts come from invitations
      minPasswordLength: PASSWORD_MIN,
      password: { hash: password => hash(password, ARGON2), verify: ({ hash: stored, password }) => verify(stored, password) },
      resetPasswordTokenExpiresIn: RESET_TOKEN_TTL,
      revokeSessionsOnPasswordReset: true,
      // Called only for an existing account; the response is the same either way, so it does not reveal who has one.
      // The token goes into the fragment: it is never sent to a server or kept in access logs.
      sendResetPassword: async ({ user, token }) => {
        await mailer.send(renderMail({
          to: user.email, subject: 'Nastavení nového hesla do Softema Hub',
          lines: [`Dobrý den, ${user.name},`, 'někdo požádal o nové heslo k vašemu účtu v Softema Hub. Pokud jste to byli vy, nastavte si ho odkazem níže. Odkaz platí 1 hodinu a lze ho použít jen jednou.'],
          action: { label: 'Nastavit nové heslo', url: `${config.WEB_ORIGIN}/nove-heslo#${token}` },
          footer: 'Pokud jste o nové heslo nežádali, e-mail ignorujte. Vaše heslo zůstává beze změny.',
        }));
      },
    },
    plugins: [twoFactor({
      issuer: 'Softema Hub',
      backupCodeOptions: { storeBackupCodes: 'encrypted' },
      accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 15 * 60 },
    })],
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 },
    advanced: { ipAddress: { ipAddressHeaders: ['x-forwarded-for'] } },
    rateLimit: {
      enabled: true, window: 60, max: 100, storage: 'memory',
      customRules: {
        '/sign-in/email': { window: 60, max: config.AUTH_RATE_LIMIT_MAX },
        '/request-password-reset': strict,
        '/reset-password': strict,
        '/two-factor/verify-totp': { window: 60, max: config.AUTH_RATE_LIMIT_MAX },
        '/two-factor/verify-backup-code': { window: 60, max: config.AUTH_RATE_LIMIT_MAX },
      },
    },
    telemetry: { enabled: false },
  });
}
export type Auth = ReturnType<typeof createAuth>;
