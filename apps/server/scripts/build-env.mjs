// D139: throwaway settings for `next build` inside the Docker image. The build loads the
// server modules, which check their settings, but never connects to anything. Random values
// that pass the checks; the file is deleted in the same step, and real settings are mounted
// only when the container runs.
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const r = (n) => randomBytes(n).toString('base64url');
const env = {
  NODE_ENV: 'production',
  APP_BASE_URL: 'https://build.invalid',
  CORS_ORIGINS: 'https://build.invalid',
  DATABASE_URL: `postgresql://build:${r(16)}@127.0.0.1:5432/build`,
  SESSION_SECRET: r(48),
  ENCRYPTION_KEYS: `v1:${randomBytes(32).toString('base64')}`,
  ENCRYPTION_KEY_ID: 'v1',
  EMAIL_INDEX_KEY: randomBytes(32).toString('base64'),
  S3_ENDPOINT: 'https://s3.build.invalid',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY: r(12),
  S3_SECRET_KEY: r(24),
  S3_BUCKET_QUARANTINE: 'build-quarantine',
  S3_BUCKET_MEDIA: 'build-media',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '25',
  SMTP_FROM: 'build@build.invalid',
};
writeFileSync(
  process.argv[2] ?? '.env',
  Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n',
);
