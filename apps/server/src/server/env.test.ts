import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const good = {
  NODE_ENV: 'test',
  APP_BASE_URL: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3000, http://localhost:8081',
  DATABASE_URL: 'postgresql://jax:s3cr3tValue@localhost:5433/jax_dev',
  SESSION_SECRET: 'a'.repeat(40),
  ENCRYPTION_KEYS: `v1:${Buffer.alloc(32, 1).toString('base64')}`,
  ENCRYPTION_KEY_ID: 'v1',
  EMAIL_INDEX_KEY: Buffer.alloc(32, 2).toString('base64'),
  S3_ENDPOINT: 'http://localhost:8333',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY: 'AKIAlocal123',
  S3_SECRET_KEY: 'x'.repeat(24),
  S3_BUCKET_QUARANTINE: 'jax-quarantine',
  S3_BUCKET_MEDIA: 'jax-media',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_FROM: 'Jax <no-reply@localhost>',
};

describe('parseEnv', () => {
  it('accepts a complete config and parses CORS list and port', () => {
    const env = parseEnv(good);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:8081']);
    expect(env.SMTP_PORT).toBe(1025);
  });

  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL: _omit, ...rest } = good;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  // 🔒 Negative tests: unsafe secrets must stop the server from booting.
  it('rejects a short SESSION_SECRET', () => {
    expect(() => parseEnv({ ...good, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
  });

  it.each([
    ['SESSION_SECRET', 'replace-with-32+-random-chars-xxxxxxxxxx'],
    ['S3_SECRET_KEY', 'change-me-change-me-change-me'],
    ['DATABASE_URL', 'postgresql://jax:change-me@localhost:5433/jax_dev'],
  ])('rejects the .env.example placeholder for %s', (key, value) => {
    expect(() => parseEnv({ ...good, [key]: value })).toThrow(new RegExp(key));
  });

  it('never echoes secret values in the error message', () => {
    const leaked = 'change-me-SUPER-SENSITIVE-VALUE';
    try {
      parseEnv({ ...good, SESSION_SECRET: leaked });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain(leaked);
    }
  });

  // 🔒 D35: a misconfigured keyring must stop the server from booting.
  describe('encryption keys (D35)', () => {
    const k = (byte: number, len = 32) => Buffer.alloc(len, byte).toString('base64');
    it.each([
      ['a key that is not 32 bytes', { ENCRYPTION_KEYS: `v1:${k(1, 16)}` }],
      ['current key id missing from the keyring', { ENCRYPTION_KEY_ID: 'v2' }],
      ['duplicate key ids', { ENCRYPTION_KEYS: `v1:${k(1)},v1:${k(3)}` }],
      ['index key equal to an encryption key', { EMAIL_INDEX_KEY: k(1) }],
      ['index key that is not 32 bytes', { EMAIL_INDEX_KEY: k(2, 20) }],
      ['placeholder index key', { EMAIL_INDEX_KEY: 'replace-with-32-random-bytes-base64' }],
    ])('rejects %s', (_label, patch) => {
      expect(() => parseEnv({ ...good, ...patch })).toThrow(/ENCRYPTION_KEYS|EMAIL_INDEX_KEY/);
    });

    it('accepts several versioned keys (rotation)', () => {
      expect(() =>
        parseEnv({ ...good, ENCRYPTION_KEYS: `v1:${k(1)},v2:${k(3)}`, ENCRYPTION_KEY_ID: 'v2' }),
      ).not.toThrow();
    });
  });
});
