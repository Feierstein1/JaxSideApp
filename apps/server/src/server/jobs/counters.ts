import { logger } from '../logger';
import { purgeExpiredCounters } from '../rate-limit';
import { withJobLock } from './lock';

/** Its own lock, so it can run while the daily maintenance job does. */
export const COUNTERS_LOCK_KEY = 4_810_002;

/**
 * P13.3 (DB review A6, D109): removes expired rate-limit counters every 10 minutes. Every
 * limited request writes a counter row, so waiting for the daily job lets the table bloat.
 * Returns the number removed, or null when another run holds the lock.
 */
export async function runCounterCleanup(now: Date = new Date()): Promise<number | null> {
  return withJobLock(COUNTERS_LOCK_KEY, async () => {
    const removed = await purgeExpiredCounters(now);
    logger.info({ removed }, 'rate-limit counters cleaned');
    return removed;
  });
}
