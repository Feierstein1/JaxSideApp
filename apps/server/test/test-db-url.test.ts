import { afterEach, describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from './test-db-url.ts';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

// 🔒 Integration tests truncate tables; they must never run against the dev database.
describe('resolveTestDatabaseUrl', () => {
  it('refuses a database whose name does not end with _test', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://u:p@localhost:5433/jax_dev';
    expect(() => resolveTestDatabaseUrl()).toThrow(/does not end with _test/);
  });

  it('refuses when TEST_DATABASE_URL equals DATABASE_URL', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://u:p@localhost:5433/jax_test';
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5433/jax_test';
    expect(() => resolveTestDatabaseUrl()).toThrow(/equals DATABASE_URL/);
  });

  it('accepts a distinct *_test database', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://u:p@localhost:5433/jax_test';
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5433/jax_dev';
    expect(resolveTestDatabaseUrl()).toContain('/jax_test');
  });
});
