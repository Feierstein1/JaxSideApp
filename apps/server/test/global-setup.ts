import { execSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { resolveTestDatabaseUrl } from './test-db-url.ts';

/**
 * Once per run: empty the test database, then apply any pending migrations.
 * Emptying first lets migrations that tighten columns (e.g. NOT NULL) apply cleanly
 * over rows a previous run left behind. The URL is guarded to *_test databases only.
 * To rebuild the test DB from scratch, run `npm run db:test:reset -w @jax/server` yourself.
 */
export default async function setup() {
  const url = resolveTestDatabaseUrl();
  await truncateAll(url);
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

async function truncateAll(url: string) {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch {
    return; // Unreachable: migrate deploy below reports it clearly.
  }
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'
         AND tablename NOT IN ('_prisma_migrations', 'spatial_ref_sys')`,
    );
    if (rows.length) {
      const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
      await client.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }
}
