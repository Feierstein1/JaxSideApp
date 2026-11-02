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
  /** This site's own address, for links in its emails. */
  BUSINESS_BASE_URL: z.string().url().default('http://localhost:3100'),
  /** B1.8: email (Mailpit in development). Without SMTP_HOST, emails are only logged. */
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_FROM: z.string().min(3).default('JaxSide for Business <no-reply@localhost>'),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  /** B3.2: private storage for ad pictures (the app's media bucket, under `ads/`). */
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1).optional(),
  S3_SECRET_KEY: z.string().min(1).optional(),
  S3_BUCKET_MEDIA: z.string().min(3).default('jax-media'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}
