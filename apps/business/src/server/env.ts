import { z } from 'zod';

/** Values copied from .env.example that must never be used as real secrets. */
const PLACEHOLDER_PATTERN = /change-me|replace-with|placeholder|example-secret/i;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => /^postgres(ql)?:\/\//.test(v), 'must be a postgres:// URL'),
  /** Connections this site keeps open (the database is shared with the app server). */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(5),
  /** Signs sign-in steps, keys two-factor secrets and rate-limit keys. */
  BUSINESS_SECRET: z
    .string()
    .min(32, 'must be at least 32 characters')
    .refine((v) => !PLACEHOLDER_PATTERN.test(v), 'is still a placeholder from .env.example'),
  /** Only true behind a reverse proxy we control that sets X-Forwarded-For. */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}
