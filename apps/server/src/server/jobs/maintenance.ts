import { getConfig } from '../config';
import { db } from '../db';
import { logger } from '../logger';

const DAY_MS = 86_400_000;
/** Arbitrary constant identifying this job's Postgres advisory lock. */
const LOCK_KEY = 4_810_001;

export interface MaintenanceReport {
  locationChecks: number;
  sessions: number;
  emailTokens: number;
  rateLimitCounters: number;
}

/**
 * Daily retention cleanup (P2.5, D14). Safe to run any number of times; overlapping
 * runs are prevented with a Postgres advisory lock. Later phases add guest expiry,
 * guest-comment deletion (D17) and account crypto-shredding (D37) here.
 *
 * Returns null when another run holds the lock.
 */
export async function runMaintenance(now: Date = new Date()): Promise<MaintenanceReport | null> {
  return db.$transaction(
    async (tx) => {
      const lock = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked`;
      if (!lock[0]?.locked) return null;

      const [locationDays, sessionDays, tokenDays] = await Promise.all([
        getConfig('retention.locationCheckDays'),
        getConfig('retention.expiredSessionDays'),
        getConfig('retention.usedEmailTokenDays'),
      ]);
      const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);

      // Precise location history (D7): kept only for abuse review.
      const locationChecks = await tx.locationCheck.deleteMany({
        where: { receivedAt: { lt: ago(locationDays) } },
      });
      // Sessions that ended (expired or signed out) more than N days ago.
      const sessions = await tx.session.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: ago(sessionDays) } }, { revokedAt: { lt: ago(sessionDays) } }],
        },
      });
      // Email links/codes that were used, replaced or expired more than N days ago.
      const emailTokens = await tx.emailToken.deleteMany({
        where: {
          OR: [{ usedAt: { lt: ago(tokenDays) } }, { expiresAt: { lt: ago(tokenDays) } }],
        },
      });
      const rateLimitCounters = await tx.rateLimitCounter.deleteMany({
        where: { expiresAt: { lt: now } },
      });

      const report = {
        locationChecks: locationChecks.count,
        sessions: sessions.count,
        emailTokens: emailTokens.count,
        rateLimitCounters: rateLimitCounters.count,
      };
      logger.info({ report }, 'maintenance complete');
      return report;
    },
    { timeout: 120_000 },
  );
}
