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
  /** Local outbox for e-mails. Nothing is ever sent in this stage. */
  MAIL_OUTBOX_DIR: z.string().min(1).optional(),
});
export type Config = z.infer<typeof schema>;
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => schema.parse(env);
