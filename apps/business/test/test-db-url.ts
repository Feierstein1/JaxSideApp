import path from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Returns the test database URL and refuses anything that could be the dev database.
 * The business site has its own test database (BUSINESS_TEST_DATABASE_URL), so its tests
 * never clash with an app-server test run emptying the shared one at the same time.
 * Falls back to TEST_DATABASE_URL when it isn't set.
 */
export function resolveTestDatabaseUrl(): string {
  const envFile = path.resolve(import.meta.dirname, '../../../.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const url = process.env.BUSINESS_TEST_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('BUSINESS_TEST_DATABASE_URL is not set (see .env.example)');

  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to run tests: database "${dbName}" does not end with _test`);
  }
  if (process.env.DATABASE_URL && process.env.DATABASE_URL === url) {
    throw new Error('Refusing to run tests: the test database equals DATABASE_URL');
  }
  return url;
}
