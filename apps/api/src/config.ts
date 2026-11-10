import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(4100),
  API_HOST: z.string().default('127.0.0.1'),
  WEB_ORIGIN: z.url(),
  DATABASE_APP_URL: z.string().min(1),
  DATABASE_AUTH_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET musí mít aspoň 32 znaků.'),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  /** `outbox` (default) writes e-mails into a local folder; `resend` really sends them. */
  MAIL_PROVIDER: z.enum(['outbox', 'resend']).default('outbox'),
  MAIL_OUTBOX_DIR: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  /** Sender, e.g. `Softema Hub <hub@domena.cz>`. Without a verified domain Resend only delivers to its account owner. */
  MAIL_FROM: z.string().min(3).optional(),
  /**
   * Shared secret between the web (Next.js proxy on Vercel) and the API. When set, the API answers only requests that
   * carry it, so nobody can call the API directly and fake `x-forwarded-for` to dodge the sign-in limits.
   */
  HUB_PROXY_SECRET: z.string().min(32, 'HUB_PROXY_SECRET musí mít aspoň 32 znaků.').optional(),
}).superRefine((c, ctx) => {
  if (c.MAIL_PROVIDER === 'resend' && (!c.RESEND_API_KEY || !c.MAIL_FROM)) ctx.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'MAIL_PROVIDER=resend potřebuje RESEND_API_KEY a MAIL_FROM.' });
  if (c.NODE_ENV === 'production' && !c.HUB_PROXY_SECRET) ctx.addIssue({ code: 'custom', path: ['HUB_PROXY_SECRET'], message: 'V produkci je HUB_PROXY_SECRET povinný.' });
});
export type Config = z.infer<typeof schema>;
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => schema.parse(env);
