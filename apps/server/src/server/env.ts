import { z } from 'zod';
import { parseKeyring } from './crypto/keyring';

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

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    APP_BASE_URL: z.string().url(),
    CORS_ORIGINS: csv,
    /** Only true behind a reverse proxy we control that sets X-Forwarded-For. */
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    DATABASE_URL: postgresUrl,
    /** P13.9: connections each server process keeps open (behind a pooler, keep it small). */
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    TEST_DATABASE_URL: postgresUrl.optional(),

    SESSION_SECRET: secret(32),

    /**
     * D35 encryption keys (docs/KEY_MANAGEMENT.md). ENCRYPTION_KEYS lists every master
     * key still needed to read data ("v1:<base64>,v2:<base64>"); ENCRYPTION_KEY_ID is the
     * one used for new data. EMAIL_INDEX_KEY keys the email lookup hash.
     */
    ENCRYPTION_KEYS: secret(40),
    ENCRYPTION_KEY_ID: z.string().regex(/^[A-Za-z0-9_-]{1,16}$/),
    EMAIL_INDEX_KEY: secret(40),

    S3_ENDPOINT: z.string().url(),
    S3_REGION: z.string().min(1),
    S3_ACCESS_KEY: secret(8),
    S3_SECRET_KEY: secret(16),
    S3_BUCKET_QUARANTINE: z.string().min(3),
    S3_BUCKET_MEDIA: z.string().min(3),

    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive(),
    SMTP_FROM: z.string().min(3),
    /** D139: login for a hosted mail service (Amazon SES). Unset for Mailpit in dev. */
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASS: secret(16).optional(),
    /** D90: optional inbox that gets a copy of each Contact us message. */
    SUPPORT_INBOX: z.string().email().optional(),
    /** D172: the business website (apps/business), for the invite links this server emails. */
    BUSINESS_BASE_URL: z.string().url().default('http://localhost:3100'),
  })
  .superRefine((env, ctx) => {
    // Structural keyring checks (lengths, current key present, keys distinct).
    // The message names the rule, never the value.
    try {
      parseKeyring(env.ENCRYPTION_KEYS, env.ENCRYPTION_KEY_ID, env.EMAIL_INDEX_KEY);
    } catch (e) {
      ctx.addIssue({ code: 'custom', path: ['ENCRYPTION_KEYS'], message: (e as Error).message });
    }
    if (env.EMAIL_INDEX_KEY === env.SESSION_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_INDEX_KEY'],
        message: 'must differ from SESSION_SECRET',
      });
    }
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
