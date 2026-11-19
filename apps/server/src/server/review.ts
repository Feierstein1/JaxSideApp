import { REVIEW_POINT, type LocationReading } from '@jax/shared';
import { Prisma } from '@/generated/prisma/client';
import { getConfig, invalidateConfigCache } from './config';
import { db } from './db';

/**
 * D268: App Store / Google Play review mode. Reviewers are far from Jacksonville, where the app
 * refuses everything, so accounts an admin marks as review accounts are placed at REVIEW_POINT
 * (Five Points) while `review.enabled` is on. The swap happens once, where a request's body is
 * read (`parseBody`), so every location stage (the Duval check, post and place radius, feeds,
 * ads, statistics) sees the same point. The phone can never mark itself: the flag is only in
 * the database, set in the admin portal, and the server decides per request after sign-in.
 */

/** Requests signed in as a review account (set by requireUser / requireActor). */
const reviewRequests = new WeakSet<Request>();

export function markReviewRequest(req: Request): void {
  reviewRequests.add(req);
}

export async function reviewModeOn(): Promise<boolean> {
  return (await getConfig('review.enabled')) === 1;
}

/** A fresh, precise reading at REVIEW_POINT. */
export function reviewReading(now = Date.now()): LocationReading {
  return { ...REVIEW_POINT, accuracyMeters: 10, timestamp: now - 1_000 };
}

/** Swaps a body's `reading` for the review point when this request is a review account's. */
export async function withReviewReading<T>(req: Request, data: T): Promise<T> {
  if (!reviewRequests.has(req)) return data;
  if (typeof data !== 'object' || data === null || !('reading' in data)) return data;
  if (!(await reviewModeOn())) return data;
  return { ...data, reading: reviewReading() };
}

// ───────────── Part 2: review accounts' content stays among review accounts ─────────────

/**
 * SQL to add to a list's WHERE: hides what a review account wrote from everyone who isn't a
 * review account (reviewers still see each other's, and their own). Always on, whatever
 * `review.enabled` says, so test posts never reach real people. `authorColumn` may be null
 * (a guest or a business wrote it): those always show.
 */
export function hideReviewContent(viewerId: string, authorColumn: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`AND (
    NOT EXISTS (SELECT 1 FROM "User" ra WHERE ra.id = ${authorColumn} AND ra."reviewAccount")
    OR EXISTS (SELECT 1 FROM "User" rv WHERE rv.id = ${viewerId}::uuid AND rv."reviewAccount"))`;
}

/** Are these two accounts on different sides (one a review account, the other not)? */
export async function reviewSeparated(a: string, b: string): Promise<boolean> {
  const rows = await db.user.findMany({
    where: { id: { in: [a, b] } },
    select: { id: true, reviewAccount: true },
  });
  const flag = new Map(rows.map((r) => [r.id, r.reviewAccount]));
  return (flag.get(a) ?? false) !== (flag.get(b) ?? false);
}

/** Of `userIds`, those on the other side from `authorId` (they never hear from each other). */
export async function reviewSeparatedFrom(authorId: string, userIds: string[]) {
  if (!userIds.length) return new Set<string>();
  const rows = await db.user.findMany({
    where: { id: { in: [authorId, ...userIds] } },
    select: { id: true, reviewAccount: true },
  });
  const author = rows.find((r) => r.id === authorId)?.reviewAccount ?? false;
  return new Set(
    rows.filter((r) => r.id !== authorId && r.reviewAccount !== author).map((r) => r.id),
  );
}

/** Turns review mode on or off for everyone (admin portal, audited by the caller). */
export async function setReviewMode(on: boolean): Promise<void> {
  await db.appConfiguration.upsert({
    where: { key: 'review.enabled' },
    create: { key: 'review.enabled', value: on ? 1 : 0 },
    update: { value: on ? 1 : 0 },
  });
  invalidateConfigCache();
}
