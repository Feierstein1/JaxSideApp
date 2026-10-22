import { Prisma } from '@/generated/prisma/client';
import { db } from '../db';

/** Tables the cleanup jobs delete from in batches. */
type PurgeTable = 'Session' | 'EmailToken' | 'Notification' | 'RateLimitCounter' | 'AreaVisit';

export const PURGE_BATCH = 5000;

/**
 * P13.3: deletes the rows matching `where` a batch at a time, each batch its own short
 * statement, until none are left. One huge DELETE would hold its locks and keep vacuum from
 * cleaning up until it finished. Rows are picked by their physical address (`ctid`), which
 * every table has, including ones without an `id` column.
 */
export async function deleteInBatches(
  table: PurgeTable,
  where: Prisma.Sql,
  batch = PURGE_BATCH,
): Promise<number> {
  const t = Prisma.raw(`"${table}"`);
  let total = 0;
  for (;;) {
    const n = await db.$executeRaw`
      DELETE FROM ${t} WHERE ctid = ANY(ARRAY(SELECT ctid FROM ${t} WHERE ${where} LIMIT ${batch}))`;
    total += n;
    if (n < batch) return total;
  }
}
