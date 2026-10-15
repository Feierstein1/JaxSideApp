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
  try {
    execSync('npx prisma migrate deploy', {
      cwd: path.resolve(import.meta.dirname, '..'),
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  } catch (err) {
    const output = String((err as { stderr?: Buffer }).stderr ?? '');
    if (output.includes('P1001')) {
      throw new Error(
        'Test database is not reachable. Start Docker Desktop, then run `npm run services:up`.',
        { cause: err },
      );
    }
    throw new Error(`prisma migrate deploy failed:\n${output}`, { cause: err });
  }
}
