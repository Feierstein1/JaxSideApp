import { db } from '@/server/db';

/** Empties every application table. Only ever runs against the guarded test database. */
export async function resetDb(): Promise<void> {
  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' AND tablename <> 'spatial_ref_sys'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

/**
 * Lifts the 10-second burst limits (P5.3) for tests that create content back to back.
 * The burst rules themselves are covered in `rate-limits.test.ts`.
 */
export async function relaxBurstLimits(): Promise<void> {
  await db.appConfiguration.createMany({
    data: [
      { key: 'rateLimit.post.burstPer10s', value: 1000 },
      { key: 'rateLimit.comment.burstPer10s', value: 1000 },
      { key: 'rateLimit.vote.burstPer10s', value: 1000 },
    ],
    skipDuplicates: true,
  });
}
