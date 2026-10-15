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
  guestsExpired: number;
  guestsPurged: number;
  guestCommentsDeleted: number;
  guestCommentsBlanked: number;
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

      // P4.4: guests expire after N days without activity (server-side clock).
      const guestsExpired = await tx.guestSession.updateMany({
        where: { status: 'ACTIVE', expiresAt: { lt: now } },
        data: { status: 'EXPIRED' },
      });
      // D14: expired guests' session data is deleted after N days. Banned guests (and
      // guests on banned installations) are kept so the ban keeps working (P4.6).
      const guestDataDays = await getConfig('retention.guestDataDays');
      const guestsPurged = await tx.guestSession.deleteMany({
        where: {
          status: 'EXPIRED',
          bannedAt: null,
          expiresAt: { lt: ago(guestDataDays) },
          installation: { bannedAt: null },
        },
      });

      // P4.5 / D17: guest comments are shown for a year, then removed. Skipped while a
      // report on them is still open. A comment with replies is blanked (kept as a
      // "[deleted]" placeholder) so others' replies survive; once it has no replies, a
      // later run deletes it.
      const visibleDays = await getConfig('guest.commentVisibleDays');
      const cutoff = ago(visibleDays);
      const old = await tx.$queryRaw<
        {
          id: string;
          status: string;
          generalPostId: string | null;
          businessPostId: string | null;
          has_replies: boolean;
        }[]
      >`
        SELECT c.id, c.status::text, c."generalPostId", c."businessPostId",
               EXISTS (SELECT 1 FROM "Comment" r WHERE r."parentCommentId" = c.id) AS has_replies
        FROM "Comment" c
        WHERE c."authorKind" = 'GUEST' AND c."createdAt" < ${cutoff}
          AND NOT EXISTS (SELECT 1 FROM "Report" rp WHERE rp."commentId" = c.id AND rp.status = 'OPEN')`;
      for (const c of old.filter((x) => x.status === 'VISIBLE')) {
        if (c.generalPostId) {
          await tx.$executeRaw`UPDATE "GeneralPost" SET "commentCount" = GREATEST("commentCount" - 1, 0) WHERE id = ${c.generalPostId}::uuid`;
        } else if (c.businessPostId) {
          await tx.$executeRaw`UPDATE "BusinessPost" SET "commentCount" = GREATEST("commentCount" - 1, 0) WHERE id = ${c.businessPostId}::uuid`;
        }
      }
      const blank = old.filter((c) => c.has_replies).map((c) => c.id);
      const remove = old.filter((c) => !c.has_replies).map((c) => c.id);
      const guestCommentsBlanked = blank.length
        ? (
            await tx.comment.updateMany({
              where: { id: { in: blank } },
              data: { body: '', status: 'DELETED', authorGuestId: null },
            })
          ).count
        : 0;
      const guestCommentsDeleted = remove.length
        ? (await tx.comment.deleteMany({ where: { id: { in: remove } } })).count
        : 0;

      const report = {
        locationChecks: locationChecks.count,
        sessions: sessions.count,
        emailTokens: emailTokens.count,
        rateLimitCounters: rateLimitCounters.count,
        guestsExpired: guestsExpired.count,
        guestsPurged: guestsPurged.count,
        guestCommentsDeleted,
        guestCommentsBlanked,
      };
      logger.info({ report }, 'maintenance complete');
      return report;
    },
    { timeout: 120_000 },
  );
}
