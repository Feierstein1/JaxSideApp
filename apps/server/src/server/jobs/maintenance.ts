import { purgeAdMarks } from '../ads/counting';
import { purgeChat } from '../chat/chat';
import { purgeOldPresence } from '../chat/presence';
import { Prisma } from '@/generated/prisma/client';
import { evaluateAchievements } from '../achievements';
import { finalizeDuePolls } from '../polls';
import { purgeDeletedTopics } from '../topics';
import { expirePlaceChanges, purgeRemovedPlacePosts } from '../directory/place-changes';
import { purgeUnusedPhotos } from '../media/photos';
import { purgeExpiredCounters } from '../rate-limit';
import { purgeOldMessageEvidence } from '../social/messages';

import { purgeDeletedAccounts } from '../auth/account';
import { getConfig } from '../config';
import { db } from '../db';
import { logger } from '../logger';
import { deleteInBatches } from './batch';
import { withJobLock } from './lock';
import { runRetention, type RetentionReport } from './retention';
import { runAreaStats, type AreaStatsReport } from '../stats/rollup';

const DAY_MS = 86_400_000;
/** Arbitrary constant identifying this job's Postgres advisory lock. */
export const MAINTENANCE_LOCK_KEY = 4_810_001;
/** Multi-statement steps get their own transaction with this much time. */
const STEP_TIMEOUT_MS = 60_000;
/** P13.6: daily LocationCheck pieces are created this many days ahead. */
const PARTITION_DAYS_AHEAD = 8;

export interface MaintenanceReport extends Partial<Omit<RetentionReport, 'notificationsDeleted'>> {
  locationChecks: number;
  sessions: number;
  emailTokens: number;
  rateLimitCounters: number;
  guestsExpired: number;
  guestsPurged: number;
  guestCommentsDeleted: number;
  guestCommentsBlanked: number;
  accountsPurged: number;
  suspensionsEnded: number;
  achievementsAwarded: number;
  unusedPhotosDeleted: number;
  notificationsDeleted?: number;
  placeChangesExpired?: number;
  removedPlacePostsDeleted?: number;
  messageEvidencePurged?: number;
  /** D116: the anonymous area statistics counted tonight. */
  areaStats?: AreaStatsReport;
  /** D123: polls that closed and were counted (votes deleted, key destroyed). */
  pollsCounted?: number;
  /** D134: topics deleted by their creator, removed after the keep period. */
  topicsPurged?: number;
  /** D202: subscriptions past their end date, marked expired. */
  subscriptionsExpired?: number;
  /** D206: ad view marks and old ad choices deleted. */
  adViewMarksDeleted?: number;
  adChoicesDeleted?: number;
}

/**
 * Daily retention cleanup (P2.5, D14). Safe to run any number of times; overlapping
 * runs are prevented with a Postgres advisory lock. Later phases add guest expiry,
 * guest-comment deletion (D17) and account crypto-shredding (D37) here.
 *
 * P13.3: each step runs on its own (single statement, or its own short transaction), and
 * the big tables are deleted in batches, so a large backlog never becomes one long
 * transaction that times out or holds back vacuum.
 *
 * Returns null when another run holds the lock.
 */
export async function runMaintenance(now: Date = new Date()): Promise<MaintenanceReport | null> {
  return withJobLock(MAINTENANCE_LOCK_KEY, () => maintain(now));
}

async function maintain(now: Date): Promise<MaintenanceReport> {
  const [locationDays, sessionDays, tokenDays] = await Promise.all([
    getConfig('retention.locationCheckDays'),
    getConfig('retention.expiredSessionDays'),
    getConfig('retention.usedEmailTokenDays'),
  ]);
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);

  // Precise location history (D7): kept only for abuse review. P13.6: the table is split by
  // day, so whole days past retention are dropped instead of deleted row by row; days ahead
  // are created first.
  const locationChecks = await rollLocationCheckPartitions(now, ago(locationDays));
  // Sessions that ended (expired or signed out) more than N days ago.
  const sessions = await deleteInBatches(
    'Session',
    Prisma.sql`("expiresAt" < ${ago(sessionDays)} OR "revokedAt" < ${ago(sessionDays)})`,
  );
  // Email links/codes that were used, replaced or expired more than N days ago.
  const emailTokens = await deleteInBatches(
    'EmailToken',
    Prisma.sql`("usedAt" < ${ago(tokenDays)} OR "expiresAt" < ${ago(tokenDays)})`,
  );
  // P13.3: also every 10 minutes (jobs/counters.ts); kept here as a backstop.
  const rateLimitCounters = await purgeExpiredCounters(now);

  // D180: sign-in burst records are kept 90 days.
  await db.securityEvent.deleteMany({ where: { createdAt: { lt: ago(90) } } });

  // D218: chat presence sightings are kept 60 minutes.
  await purgeOldPresence(now);
  await purgeChat(now); // lines an hour after they expired; rooms idle for 7 days

  // P4.4: guests expire after N days without activity (server-side clock).
  const guestsExpired = await db.guestSession.updateMany({
    where: { status: 'ACTIVE', expiresAt: { lt: now } },
    data: { status: 'EXPIRED' },
  });
  // D14: expired guests' session data is deleted after N days. Banned guests (and
  // guests on banned installations) are kept so the ban keeps working (P4.6).
  const guestDataDays = await getConfig('retention.guestDataDays');
  const guestsPurged = await db.guestSession.deleteMany({
    where: {
      status: 'EXPIRED',
      bannedAt: null,
      expiresAt: { lt: ago(guestDataDays) },
      installation: { bannedAt: null },
    },
  });

  const { guestCommentsBlanked, guestCommentsDeleted } = await db.$transaction(
    (tx) => purgeGuestComments(tx, ago),
    { timeout: STEP_TIMEOUT_MS },
  );

  // P5.6: suspensions that have run out go back to ACTIVE (they already stopped
  // blocking at suspendedUntil; this tidies the status).
  const suspensionsEnded = await db.user.updateMany({
    where: { status: 'SUSPENDED', suspendedUntil: { lte: now } },
    data: { status: 'ACTIVE', suspendedUntil: null },
  });

  const report = {
    locationChecks,
    sessions,
    emailTokens,
    rateLimitCounters,
    guestsExpired: guestsExpired.count,
    guestsPurged: guestsPurged.count,
    guestCommentsDeleted,
    guestCommentsBlanked,
    // D37: crypto-shred deleted accounts past retention (skipping legal holds).
    accountsPurged: await db.$transaction((tx) => purgeDeletedAccounts(now, tx), {
      timeout: STEP_TIMEOUT_MS,
    }),
    suspensionsEnded: suspensionsEnded.count,
    // P6.8: medals that depend on time (First Contribution after 24 h).
    achievementsAwarded: await db.$transaction((tx) => evaluateAchievements(now, undefined, tx), {
      timeout: STEP_TIMEOUT_MS,
    }),
    // P6.2: uploads never attached to a post or profile within a day.
    unusedPhotosDeleted: await purgeUnusedPhotos(now),
    // D107 (P13.7): notifications, deleted/removed content, unsent messages, removed media,
    // location flags, old installations, resolved tickets. Never while a report is open.
    ...(await runRetention(now)),

    // D94: place suggestions and removal requests undecided after 60 days.
    placeChangesExpired: await expirePlaceChanges(now),
    // D101: posts of places removed more than 90 days ago.
    removedPlacePostsDeleted: await purgeRemovedPlacePosts(now),
    // D98: message snapshots on reports are kept for a year.
    messageEvidencePurged: await purgeOldMessageEvidence(now),
    areaStats: await runAreaStats(now),
    // D123: closed polls not yet counted (normally counted when someone opens them).
    pollsCounted: await finalizeDuePolls(now),
    // D134: topics their creators deleted more than a week ago (posts go via retention).
    topicsPurged: await purgeDeletedTopics(now),
    // D202: subscriptions whose end date passed (e.g. the free month) are marked expired.
    subscriptionsExpired: (
      await db.subscription.updateMany({
        where: { status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] }, endsAt: { lte: now } },
        data: { status: 'EXPIRED' },
      })
    ).count,
    // D206: ad view marks after two days; Interested / Not interested once past both windows.
    ...(await purgeAdMarks(
      now,
      Math.max(await getConfig('ads.notInterestedDays'), await getConfig('ads.interestedDays')),
    )),
  };
  logger.info({ report }, 'maintenance complete');
  return report;
}

/**
 * P13.6 (D106): makes sure the next PARTITION_DAYS_AHEAD days have a LocationCheck piece, and
 * drops the days that are entirely older than `cutoff` (plus older rows in the catch-all).
 * Returns the number of rows removed.
 */
export async function rollLocationCheckPartitions(now: Date, cutoff: Date): Promise<number> {
  const today = now.toISOString().slice(0, 10); // UTC day, like the pieces
  await db.$queryRaw`SELECT location_check_ensure_partitions(${today}::date, ${PARTITION_DAYS_AHEAD}::int)`;
  const [row] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT location_check_drop_partitions(${cutoff}::timestamptz) AS n`;
  return Number(row?.n ?? 0);
}

/**
 * P4.5 / D17: guest comments
 are shown for a year, then removed. Skipped while a
 * report on them is still open. A comment with replies is blanked (kept as a
 * "[deleted]" placeholder) so others' replies survive; once it has no replies, a
 * later run deletes it. One transaction, so the post comment counts stay right.
 */
async function purgeGuestComments(tx: Prisma.TransactionClient, ago: (days: number) => Date) {
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
  return { guestCommentsBlanked, guestCommentsDeleted };
}
