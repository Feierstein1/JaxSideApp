import { execSync } from 'node:child_process';
import path from 'node:path';
import { resolveTestDatabaseUrl } from './test-db-url.ts';

/**
 * Once per run: apply any pending migrations to the test database (non-destructive).
 * Tests clear data themselves with resetDb(). To rebuild the test DB from scratch,
 * run `npm run db:test:reset -w @jax/server` yourself.
 */
export default function setup() {
  const url = resolveTestDatabaseUrl();
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
