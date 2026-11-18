import { hash, verify } from '@node-rs/argon2';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import type { PrismaClient } from '@softema/db';
import { LOGIN_LOCK, normalizeEmail, PASSWORD_MIN } from '@softema/shared';
import type { Config } from '../config';
import { type Mailer, renderMail } from '../mail/mailer';

// OWASP baseline for argon2id. Algorithm 2 = Argon2id.
export const ARGON2 = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const RESET_TOKEN_TTL = 60 * 60;

const lockedError = () => new APIError('TOO_MANY_REQUESTS', {
  code: 'ACCOUNT_LOCKED',
  message: `Účet je kvůli opakovaně špatnému heslu na ${LOGIN_LOCK.minutes} minut zamčený.`,
});

/**
 * Temporary lock after LOGIN_LOCK.attempts wrong passwords in a row (zadání 6.1), on top of the per-IP rate limit:
 * the rate limit stops one attacker, the lock stops guessing one account from many addresses. It counts any address,
 * existing or not, so the answer never reveals who has an account. A correct password or a password reset clears it.
 */
function loginLock(db: PrismaClient) {
  const emailOf = (body: unknown) => normalizeEmail(String((body as { email?: unknown } | undefined)?.email ?? ''));
  return {
    before: async (body: unknown) => {
      const email = emailOf(body);
      if (!email) return;
      const lock = await db.loginLock.findUnique({ where: { emailNormalized: email }, select: { lockedUntil: true } });
      if (lock?.lockedUntil && lock.lockedUntil > new Date()) throw lockedError();
    },
    after: async (body: unknown, returned: unknown) => {
      const email = emailOf(body);
      if (!email) return;
      if (isAPIError(returned)) {
        if (returned.statusCode !== 401) return; // only a wrong e-mail or password counts
        // One statement, so parallel attempts cannot slip past the limit. A failure after a quiet window starts over.
        await db.$executeRaw`
          insert into hub.login_lock (email_normalized, failed_count, last_failed_at) values (${email}, 1, now())
          on conflict (email_normalized) do update set
            failed_count = case when hub.login_lock.last_failed_at < now() - make_interval(mins => ${LOGIN_LOCK.minutes}) then 1 else hub.login_lock.failed_count + 1 end,
            last_failed_at = now(),
            locked_until = case when (case when hub.login_lock.last_failed_at < now() - make_interval(mins => ${LOGIN_LOCK.minutes}) then 1 else hub.login_lock.failed_count + 1 end) >= ${LOGIN_LOCK.attempts}
              then now() + make_interval(mins => ${LOGIN_LOCK.minutes}) else hub.login_lock.locked_until end`;
        await db.loginLock.deleteMany({ where: { lastFailedAt: { lt: new Date(Date.now() - 86_400_000) } } });
      } else if (returned) {
        await db.loginLock.deleteMany({ where: { emailNormalized: email } });
      }
    },
    clear: (email: string) => db.loginLock.deleteMany({ where: { emailNormalized: normalizeEmail(email) } }),
  };
}

/** Auth runs on its own database role: it can read password hashes and TOTP secrets, the application role cannot. */
export function createAuth(config: Config, db: PrismaClient, mailer: Mailer) {
  const strict = { window: 15 * 60, max: config.AUTH_RATE_LIMIT_MAX };
  const lock = loginLock(db);
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
      // Whoever proved access to the mailbox may sign in again right away.
      onPasswordReset: async ({ user }) => { await lock.clear(user.email); },
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
    hooks: {
      before: createAuthMiddleware(async ctx => { if (ctx.path === '/sign-in/email') await lock.before(ctx.body); }),
      after: createAuthMiddleware(async ctx => { if (ctx.path === '/sign-in/email') await lock.after(ctx.body, ctx.context.returned); }),
    },
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 },
    // Behind the Vercel proxy the visitor's IP comes in x-hub-client-ip, trusted only because every request must carry
    // the proxy secret (bootstrap.ts). Locally the API sits behind Next.js on 127.0.0.1 and x-forwarded-for is enough.
    advanced: { ipAddress: { ipAddressHeaders: config.HUB_PROXY_SECRET ? ['x-hub-client-ip', 'x-forwarded-for'] : ['x-forwarded-for'] } },
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
