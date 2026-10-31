import path from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Returns the test database URL and refuses anything that could be the dev database
 * (same guard as the app server's tests).
 */
export function resolveTestDatabaseUrl(): string {
  const envFile = path.resolve(import.meta.dirname, '../../../.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see .env.example)');

  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to run tests: database "${dbName}" does not end with _test`);
  }
  if (process.env.DATABASE_URL && process.env.DATABASE_URL === url) {
    throw new Error('Refusing to run tests: TEST_DATABASE_URL equals DATABASE_URL');
  }
  return url;
}
