import type { PlaceSummary } from '@jax/shared';
import { Prisma, type User } from '@/generated/prisma/client';
import { pastAccountWait } from '../account-age';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { pageWindow, toPage } from '../admin/paging';

/**
 * D144: liking or disliking a place, only while you're there (the route checks location).
 * One vote per person per place (the table's primary key), changeable any time; the
 * place's likeCount / dislikeCount move in the same transaction, with the place row locked
 * so two votes at once can't miscount. Owners can't vote on their own place.
 */
export async function ratePlace(
  user: Pick<User, 'id' | 'createdAt' | 'role' | 'staffBadge'>,
  placeId: string,
  value: -1 | 0 | 1,
  now = new Date(),
): Promise<Pick<PlaceSummary, 'rating' | 'myRating' | 'ratingsLocked'>> {
  const minDays = await getConfig('places.ratingMinAccountDays');
  if (!pastAccountWait(user, minDays, now)) {
    throw new ApiError(
      403,
      'ACCOUNT_TOO_NEW',
      `New accounts can rate places after ${minDays} days. Thanks for your patience.`,
    );
  }
  // D185 / B6.5: personal accounts are never linked to a business, so "owners can't rate
  // their own place" can't be known here any more (the old in-app owner claim is gone).

  const counts = await db.$transaction(async (tx) => {
    const [place] = await tx.$queryRaw<{ ratingsLockedAt: Date | null }[]>`
      SELECT "ratingsLockedAt" FROM "BusinessPlace"
      WHERE id = ${placeId}::uuid AND status = 'ACTIVE' FOR UPDATE`;
    if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found');
    if (place.ratingsLockedAt) {
      throw new ApiError(423, 'RATINGS_LOCKED', 'Rating this place is paused for now.');
    }
    const before =
      (
        await tx.placeRating.findUnique({
          where: { placeId_userId: { placeId, userId: user.id } },
          select: { value: true },
        })
      )?.value ?? 0;
    if (value === 0) {
      await tx.placeRating.deleteMany({ where: { placeId, userId: user.id } });
    } else {
      await tx.placeRating.upsert({
        where: { placeId_userId: { placeId, userId: user.id } },
        create: { placeId, userId: user.id, value },
        update: { value },
      });
    }
    const likes = (value === 1 ? 1 : 0) - (before === 1 ? 1 : 0);
    const dislikes = (value === -1 ? 1 : 0) - (before === -1 ? 1 : 0);
    return tx.businessPlace.update({
      where: { id: placeId },
      data: { likeCount: { increment: likes }, dislikeCount: { increment: dislikes } },
      select: { likeCount: true, dislikeCount: true, ratingsLockedAt: true },
    });
  });
  return {
    rating: await ratingView(counts.likeCount, counts.dislikeCount),
    myRating: value,
    ratingsLocked: !!counts.ratingsLockedAt,
  };
}

/** D144: the shown rating: % liked once `min` people voted, else null (not shown yet). */
export function ratingFromCounts(likes: number, dislikes: number, min: number) {
  const votes = likes + dislikes;
  return votes >= min ? { likedPercent: Math.round((likes * 100) / votes), votes } : null;
}

async function ratingView(likes: number, dislikes: number) {
  return ratingFromCounts(likes, dislikes, await getConfig('places.ratingMinVotes'));
}

/** D144 (admin): places with the most rating activity lately, and every locked one. */
export async function adminRatingActivity(page = 1, now = new Date(), days = 7) {
  const since = new Date(now.getTime() - days * 86_400_000);
  const { skip, take } = pageWindow(page);
  const listed = Prisma.sql`p."ratingsLockedAt" IS NOT NULL
       OR EXISTS (SELECT 1 FROM "PlaceRating" x WHERE x."placeId" = p.id AND x."updatedAt" > ${since})`;
  const [rows, count] = await Promise.all([
    db.$queryRaw<
      {
        id: string;
        name: string;
        likeCount: number;
        dislikeCount: number;
        ratingsLockedAt: Date | null;
        recent: number;
        last_day: number;
      }[]
    >`
    SELECT p.id, p.name, p."likeCount", p."dislikeCount", p."ratingsLockedAt",
           count(r."userId")::int AS recent,
           count(r."userId") FILTER (WHERE r."updatedAt" > ${new Date(now.getTime() - 86_400_000)})::int AS last_day
    FROM "BusinessPlace" p
    LEFT JOIN "PlaceRating" r ON r."placeId" = p.id AND r."updatedAt" > ${since}
    WHERE ${listed}
    GROUP BY p.id
    ORDER BY (p."ratingsLockedAt" IS NOT NULL) DESC, last_day DESC, recent DESC, p.name, p.id
    LIMIT ${take} OFFSET ${skip}`,
    db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "BusinessPlace" p WHERE ${listed}`,
  ]);
  const total = count[0]?.n ?? 0;
  const list = rows.map((r) => ({
    id: r.id,
    name: r.name,
    likes: r.likeCount,
    dislikes: r.dislikeCount,
    locked: !!r.ratingsLockedAt,
    votesLastWeek: r.recent,
    votesLastDay: r.last_day,
  }));
  return toPage(list, total, page);
}

/** D144 (admin): pause or resume voting on a place, or delete all its votes. */
export async function adminPlaceRatings(placeId: string, action: 'lock' | 'unlock' | 'clear') {
  const place = await db.businessPlace.findUnique({ where: { id: placeId }, select: { id: true } });
  if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found');
  if (action === 'clear') {
    // Same lock as a vote, so one landing mid-clear can't leave the counts off.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "BusinessPlace" WHERE id = ${placeId}::uuid FOR UPDATE`;
      await tx.placeRating.deleteMany({ where: { placeId } });
      await tx.businessPlace.update({
        where: { id: placeId },
        data: { likeCount: 0, dislikeCount: 0 },
      });
    });
    return;
  }
  await db.businessPlace.update({
    where: { id: placeId },
    data: { ratingsLockedAt: action === 'lock' ? new Date() : null },
  });
}
