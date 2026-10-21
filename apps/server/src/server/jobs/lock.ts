import { Client } from 'pg';
import { getEnv } from '../env';

/**
 * P13.3: runs `fn` while holding a Postgres advisory lock, so two runs of the same job never
 * overlap. The lock is a session lock on its own connection (Prisma's pooled connections can't
 * hold one across steps), which lets each step of the job use its own short transaction. If
 * the process dies, the connection closes and Postgres releases the lock by itself.
 *
 * Returns null (without running `fn`) when another run holds the lock.
 */
export async function withJobLock<T>(key: number, fn: () => Promise<T>): Promise<T | null> {
  const client = new Client({ connectionString: getEnv().DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [key],
    );
    if (!rows[0]?.locked) return null;
    try {
      return await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [key]);
    }
  } finally {
    await client.end();
  }
}
