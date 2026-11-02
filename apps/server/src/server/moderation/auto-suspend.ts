import type { Prisma } from '@/generated/prisma/client';
import { getConfig } from '../config';

/**
 * D74: when many different people report the same account (its profile or anything it
 * posted) in a short time, suspend it right away, hide its posts, and put an automatic
 * report at the top of the moderators' queue. Nothing is deleted: a moderator either bans
 * (the hidden posts become removed) or lifts it (exactly those posts come back).
 *
 * Only reporters with a confirmed email and an account older than a few days count, so a
 * handful of throwaway accounts can't knock someone off the app.
 */

export interface AutoSuspendConfig {
  reporters: number;
  windowDays: number;
  reporterMinAccountDays: number;
  suspendDays: number;
}

export async function autoSuspendConfig(): Promise<AutoSuspendConfig> {
  const [reporters, windowDays, reporterMinAccountDays, suspendDays] = await Promise.all([
    getConfig('moderation.autoSuspendReporters'),
    getConfig('moderation.autoSuspendWindowDays'),
    getConfig('moderation.reporterMinAccountDays'),
    getConfig('moderation.autoSuspendDays'),
  ]);
  return { reporters, windowDays, reporterMinAccountDays, suspendDays };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Distinct qualifying people with open reports on this account or its content, recently. */
export async function recentReporterCount(
  tx: Prisma.TransactionClient,
  userId: string,
  cfg: AutoSuspendConfig,
  now: Date,
): Promise<number> {
  const since = new Date(now.getTime() - cfg.windowDays * DAY_MS);
  const joinedBefore = new Date(now.getTime() - cfg.reporterMinAccountDays * DAY_MS);
  const [row] = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(DISTINCT r."reporterUserId")::int AS n
    FROM "Report" r
    JOIN "User" u ON u.id = r."reporterUserId"
    LEFT JOIN "GeneralPost" gp ON gp.id = r."generalPostId"
    LEFT JOIN "BusinessPost" bp ON bp.id = r."businessPostId"
    LEFT JOIN "Comment" c ON c.id = r."commentId"
    LEFT JOIN "Photo" ph ON ph.id = r."photoId"
    LEFT JOIN "Message" m ON m.id = r."messageId"
    WHERE r.status = 'OPEN' AND r."createdAt" >= ${since}
      AND u."emailVerifiedAt" IS NOT NULL AND u."createdAt" <= ${joinedBefore}
      AND (r."reportedUserId" = ${userId}::uuid OR gp."authorId" = ${userId}::uuid
        OR bp."authorId" = ${userId}::uuid OR c."authorUserId" = ${userId}::uuid
        OR ph."uploaderId" = ${userId}::uuid OR m."senderId" = ${userId}::uuid)`;
  return row?.n ?? 0;
}

/** Runs inside the report's transaction, after the new report is saved. */
export async function maybeAutoSuspend(
  tx: Prisma.TransactionClient,
  userId: string,
  cfg: AutoSuspendConfig,
  now = new Date(),
): Promise<boolean> {
  // One decision at a time per account, so simultaneous reports count each other.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'autosuspend:' + userId}))`;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (user?.status !== 'ACTIVE') return false;
  if (
    await tx.autoSuspension.findFirst({ where: { userId, status: 'OPEN' }, select: { id: true } })
  )
    return false;
  const reporters = await recentReporterCount(tx, userId, cfg, now);
  if (reporters < cfg.reporters) return false;

  const general = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "GeneralPost" SET status = 'HELD_FOR_REVIEW', "updatedAt" = now()
    WHERE "authorId" = ${userId}::uuid AND status = 'VISIBLE' RETURNING id`;
  const business = await tx.$queryRaw<{ id: string; placeId: string }[]>`
    UPDATE "BusinessPost" SET status = 'HELD_FOR_REVIEW', "updatedAt" = now()
    WHERE "authorId" = ${userId}::uuid AND status = 'VISIBLE' RETURNING id, "placeId"`;
  await movePlaceCounts(tx, business, -1);

  await tx.user.update({
    where: { id: userId },
    data: {
      status: 'SUSPENDED',
      suspendedUntil: new Date(now.getTime() + cfg.suspendDays * DAY_MS),
    },
  });
  await tx.autoSuspension.create({
    data: {
      userId,
      reporterCount: reporters,
      heldGeneralPostIds: general.map((p) => p.id),
      heldBusinessPostIds: business.map((p) => p.id),
    },
  });
  // The moderators' notice: an automatic report on the account (top of the queue).
  const hidden = general.length + business.length;
  await tx.report.create({
    data: {
      reportedUserId: userId,
      reason: 'OTHER',
      details:
        `Automatic suspension: ${reporters} different people reported this account or its ` +
        `posts in the last ${cfg.windowDays} days. ${hidden} post${hidden === 1 ? '' : 's'} ` +
        `hidden. Ban to confirm (posts are removed) or Lift to restore the account and posts.`,
    },
  });
  return true;
}

async function movePlaceCounts(
  tx: Prisma.TransactionClient,
  posts: { placeId: string }[],
  sign: 1 | -1,
) {
  const perPlace = new Map<string, number>();
  for (const p of posts) perPlace.set(p.placeId, (perPlace.get(p.placeId) ?? 0) + 1);
  for (const [placeId, n] of perPlace) {
    await tx.businessPlace.update({
      where: { id: placeId },
      data: { postCount: { increment: sign * n } },
    });
  }
}

/**
 * Called when a moderator bans or lifts the account. Ban: the hidden posts become removed.
 * Lift: posts it hid (and that are still hidden) come back. Either way the automatic
 * notice is closed. No-op if there's no open automatic suspension.
 */
export async function resolveAutoSuspension(
  tx: Prisma.TransactionClient,
  userId: string,
  outcome: 'CONFIRMED' | 'RESTORED',
  now = new Date(),
) {
  const open = await tx.autoSuspension.findFirst({ where: { userId, status: 'OPEN' } });
  if (!open) return;
  const to = outcome === 'CONFIRMED' ? 'REMOVED' : 'VISIBLE';
  await tx.generalPost.updateMany({
    where: { id: { in: open.heldGeneralPostIds }, status: 'HELD_FOR_REVIEW' },
    data: { status: to },
  });
  const business = await tx.businessPost.findMany({
    where: { id: { in: open.heldBusinessPostIds }, status: 'HELD_FOR_REVIEW' },
    select: { id: true, placeId: true },
  });
  await tx.businessPost.updateMany({
    where: { id: { in: business.map((b) => b.id) } },
    data: { status: to },
  });
  if (outcome === 'RESTORED') await movePlaceCounts(tx, business, 1);
  await tx.autoSuspension.update({
    where: { id: open.id },
    data: { status: outcome, resolvedAt: now },
  });
  await tx.report.updateMany({
    where: {
      reportedUserId: userId,
      reporterUserId: null,
      reporterGuestId: null,
      status: 'OPEN',
      details: { startsWith: 'Automatic suspension:' },
    },
    data: { status: outcome === 'CONFIRMED' ? 'ACTIONED' : 'DISMISSED', resolvedAt: now },
  });
}
