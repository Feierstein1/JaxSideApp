import { z } from 'zod';

/** Values copied from .env.example that must never be used as real secrets. */
const PLACEHOLDER_PATTERN = /change-me|replace-with|placeholder|example-secret/i;

const secret = (min: number) =>
  z
    .string()
    .min(min, `must be at least ${min} characters`)
    .refine((v) => !PLACEHOLDER_PATTERN.test(v), 'is still a placeholder from .env.example');

const postgresUrl = z
  .string()
  .url()
  .refine((v) => /^postgres(ql)?:\/\//.test(v), 'must be a postgres:// URL')
  .refine((v) => !PLACEHOLDER_PATTERN.test(v), 'still contains a placeholder password');

const csv = z
  .string()
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().url()));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_BASE_URL: z.string().url(),
  CORS_ORIGINS: csv,
  /** Only true behind a reverse proxy we control that sets X-Forwarded-For. */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  DATABASE_URL: postgresUrl,
  TEST_DATABASE_URL: postgresUrl.optional(),

  SESSION_SECRET: secret(32),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY: secret(8),
  S3_SECRET_KEY: secret(16),
  S3_BUCKET_QUARANTINE: z.string().min(3),
  S3_BUCKET_MEDIA: z.string().min(3),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_FROM: z.string().min(3),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses env vars. Error messages name the variable and the rule only, never the value,
 * so a misconfigured secret is not echoed into logs.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid server environment:\n${problems}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
