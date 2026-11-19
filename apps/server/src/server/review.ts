import { REVIEW_POINT, type LocationReading } from '@jax/shared';
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

/** Turns review mode on or off for everyone (admin portal, audited by the caller). */
export async function setReviewMode(on: boolean): Promise<void> {
  await db.appConfiguration.upsert({
    where: { key: 'review.enabled' },
    create: { key: 'review.enabled', value: on ? 1 : 0 },
    update: { value: on ? 1 : 0 },
  });
  invalidateConfigCache();
}
