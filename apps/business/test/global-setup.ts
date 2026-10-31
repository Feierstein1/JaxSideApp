import { execSync } from 'node:child_process';
import path from 'node:path';
import { resolveTestDatabaseUrl } from './test-db-url.ts';

/**
 * Once per run: apply any pending migrations to the test database. The schema and its
 * migrations live with the app server (D169), so the command runs from there. Tests clear
 * the tables they use themselves; this never truncates anything.
 */
export default async function setup() {
  const url = resolveTestDatabaseUrl();
  try {
    execSync('npx prisma migrate deploy', {
      cwd: path.resolve(import.meta.dirname, '../../server'),
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  } catch (err) {
    const output = String((err as { stderr?: Buffer }).stderr ?? '');
    throw new Error(`prisma migrate deploy failed:\n${output}`, { cause: err });
  }
}
