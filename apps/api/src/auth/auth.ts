import { hash, verify } from '@node-rs/argon2';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import type { PrismaClient } from '@softema/db';
import type { Config } from '../config';

// OWASP baseline for argon2id. Algorithm 2 = Argon2id.
export const ARGON2 = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/** Auth runs on its own database role: it can read password hashes, the application role cannot. */
export function createAuth(config: Config, db: PrismaClient) {
  return betterAuth({
    baseURL: config.WEB_ORIGIN,
    basePath: '/api/auth',
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [config.WEB_ORIGIN],
    database: prismaAdapter(db, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // accounts are provisioned by an administrator
      minPasswordLength: 12,
      password: { hash: password => hash(password, ARGON2), verify: ({ hash: stored, password }) => verify(stored, password) },
    },
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 },
    advanced: { ipAddress: { ipAddressHeaders: ['x-forwarded-for'] } },
    rateLimit: {
      enabled: true, window: 60, max: 100, storage: 'memory',
      customRules: { '/sign-in/email': { window: 60, max: config.AUTH_RATE_LIMIT_MAX } },
    },
    telemetry: { enabled: false },
  });
}
export type Auth = ReturnType<typeof createAuth>;
