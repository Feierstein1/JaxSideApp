import type { PlaceChange } from '@jax/shared';
import { milesToMeters } from '@jax/shared';
import type { Prisma, User } from '@/generated/prisma/client';
import { pastAccountWait } from '../account-age';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import type { GeoPoint } from '../location/eligibility';
import { metersBetween } from '../location/neighborhood';
import { objectStore } from '../media/store';
import { approveSubmissionTx } from './submissions';

/**
 * D94: community place voting. People near a spot confirm a suggested place ("It's here" /
 * "Not here") or a removal request ("Closed" / "Still open"). Each person votes once per
 * change and can't change it. After `places.votesToDecide` (10) votes one way the change
 * is applied or dropped; changes left undecided expire after `places.changeDays` (60).
 * Every vote is kept (who, when, how far away) for admins to review.
 */

const DAY_MS = 86_400_000;
const at = (p: { latitude: number; longitude: number }) => ({ lat: p.latitude, lon: p.longitude });

export async function voterAllowed(
  user: Pick<User, 'createdAt' | 'role' | 'staffBadge'>,
  now = new Date(),
) {
  const days = await getConfig('places.voterMinAccountDays');
  if (!pastAccountWait(user, days, now)) {
    throw new ApiError(
      403,
      'ACCOUNT_TOO_NEW',
      `New accounts can vote on places after ${days} days. Thanks for your patience.`,
    );
  }
}

/**
 * Open suggestions and removal requests within the place radius of `here` that you haven't
 * voted on and didn't ask for yourself (D100: your request already counts as your vote).
 */
export async function listNearbyChanges(
  user: Pick<User, 'id' | 'createdAt' | 'role' | 'staffBadge'>,
  here: GeoPoint,
): Promise<PlaceChange[]> {
  // D162: nothing to show an account that can't vote yet (staff never wait).
  if (!pastAccountWait(user, await getConfig('places.voterMinAccountDays'))) return [];
  const userId = user.id;
  const [days, radiusMiles, needed] = await Promise.all([
    getConfig('places.changeDays'),
    getConfig('radius.business.maxMiles'),
    getConfig('places.votesToDecide'),
  ]);
  const since = new Date(Date.now() - days * DAY_MS);
  const me = `SRID=4326;POINT(${here.longitude} ${here.latitude})`;
  const meters = milesToMeters(radiusMiles);
  const rows = await db.$queryRaw<
    {
      kind: 'add' | 'remove';
      id: string;
      name: string;
      category: string;
      latitude: number;
      longitude: number;
      created_at: Date;
      yes: number;
      no: number;
      my_vote: boolean | null;
      mine: boolean;
    }[]
  >`
    SELECT 'add' AS kind, s.id, s.name, s.category, s.latitude, s.longitude, s."createdAt" AS created_at,
           (SELECT count(*)::int FROM "PlaceChangeVote" v WHERE v."submissionId" = s.id AND v.support) AS yes,
           (SELECT count(*)::int FROM "PlaceChangeVote" v WHERE v."submissionId" = s.id AND NOT v.support) AS no,
           (SELECT v.support FROM "PlaceChangeVote" v WHERE v."submissionId" = s.id AND v."voterId" = ${userId}::uuid) AS my_vote,
           (s."submitterId" = ${userId}::uuid) AS mine
    FROM "BusinessSubmission" s
    WHERE s.status = 'PENDING' AND s."createdAt" > ${since}
      AND ST_DWithin(s.location, ${me}::geography, ${meters})
      -- D100: only what's still yours to vote on (you voted, or it's your own request).
      AND s."submitterId" <> ${userId}::uuid
      AND NOT EXISTS (SELECT 1 FROM "PlaceChangeVote" v
                      WHERE v."submissionId" = s.id AND v."voterId" = ${userId}::uuid)
    UNION ALL
    SELECT 'remove', r.id, p.name, p.category, p.latitude, p.longitude, r."createdAt",
           (SELECT count(*)::int FROM "PlaceChangeVote" v WHERE v."removalId" = r.id AND v.support),
           (SELECT count(*)::int FROM "PlaceChangeVote" v WHERE v."removalId" = r.id AND NOT v.support),
           (SELECT v.support FROM "PlaceChangeVote" v WHERE v."removalId" = r.id AND v."voterId" = ${userId}::uuid),
           (r."requesterId" = ${userId}::uuid)
    FROM "PlaceRemoval" r JOIN "BusinessPlace" p ON p.id = r."placeId"
    WHERE r.status = 'OPEN' AND p.status = 'ACTIVE' AND r."createdAt" > ${since}
      AND ST_DWithin(p.location, ${me}::geography, ${meters})
      AND r."requesterId" <> ${userId}::uuid
      AND NOT EXISTS (SELECT 1 FROM "PlaceChangeVote" v
                      WHERE v."removalId" = r.id AND v."voterId" = ${userId}::uuid)`;
  return rows
    .map((r) => ({
      kind: r.kind,
      id: r.id,
      name: r.name,
      category: r.category,
      distanceMeters: Math.round(metersBetween(at(here), at(r)) / 10) * 10,
      yes: r.yes,
      no: r.no,
      needed,
      myVote: r.my_vote,
      mine: r.mine,
      createdAt: r.created_at.toISOString(),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

export type ChangeTarget = { kind: 'add' | 'remove'; id: string };

/** Where a change is (the suggested pin, or the place), for the location check. */
export async function changePoint(t: ChangeTarget): Promise<GeoPoint> {
  if (t.kind === 'add') {
    const s = await db.businessSubmission.findFirst({
      where: { id: t.id, status: 'PENDING' },
      select: { latitude: true, longitude: true },
    });
    if (!s) throw new ApiError(404, 'NOT_FOUND', 'This suggestion was already decided.');
    return s;
  }
  const r = await db.placeRemoval.findFirst({
    where: { id: t.id, status: 'OPEN' },
    include: { place: { select: { latitude: true, longitude: true } } },
  });
  if (!r) throw new ApiError(404, 'NOT_FOUND', 'This request was already decided.');
  return r.place;
}

/**
 * Casts one vote (final) and applies the outcome when a side reaches the threshold.
 * The caller has checked the location (within the place radius of the change).
 */
export async function castPlaceVote(
  user: Pick<User, 'id'>,
  t: ChangeTarget,
  support: boolean,
  from: GeoPoint,
  now = new Date(),
): Promise<{ outcome: 'open' | 'added' | 'dropped' | 'removed' | 'kept' }> {
  const needed = await getConfig('places.votesToDecide');
  return db.$transaction(async (tx) => {
    // One decision at a time per change, so simultaneous votes count each other.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'place-change:' + t.id}))`;
    const point = t.kind === 'add' ? await openSubmission(tx, t.id) : await openRemoval(tx, t.id);
    const distanceMeters = Math.round(metersBetween(at(from), at(point)));
    const res = await tx.placeChangeVote.createMany({
      data: [
        {
          voterId: user.id,
          ...(t.kind === 'add' ? { submissionId: t.id } : { removalId: t.id }),
          support,
          distanceMeters,
          createdAt: now,
        },
      ],
      skipDuplicates: true,
    });
    if (res.count === 0) {
      throw new ApiError(409, 'ALREADY_VOTED', 'You already voted on this one.');
    }
    return { outcome: await settle(tx, t, needed, now) };
  });
}

async function openSubmission(tx: Prisma.TransactionClient, id: string) {
  const s = await tx.businessSubmission.findFirst({ where: { id, status: 'PENDING' } });
  if (!s) throw new ApiError(404, 'NOT_FOUND', 'This suggestion was already decided.');
  return s;
}

async function openRemoval(tx: Prisma.TransactionClient, id: string) {
  const r = await tx.placeRemoval.findFirst({
    where: { id, status: 'OPEN' },
    include: { place: true },
  });
  if (!r) throw new ApiError(404, 'NOT_FOUND', 'This request was already decided.');
  return r.place;
}

/** Applies the result once a side has enough votes. */
async function settle(
  tx: Prisma.TransactionClient,
  t: ChangeTarget,
  needed: number,
  now: Date,
): Promise<'open' | 'added' | 'dropped' | 'removed' | 'kept'> {
  const where = t.kind === 'add' ? { submissionId: t.id } : { removalId: t.id };
  const [yes, no] = await Promise.all([
    tx.placeChangeVote.count({ where: { ...where, support: true } }),
    tx.placeChangeVote.count({ where: { ...where, support: false } }),
  ]);
  if (t.kind === 'add') {
    if (yes >= needed) {
      const s = await tx.businessSubmission.update({
        where: { id: t.id },
        data: { status: 'APPROVED', reviewedAt: now, decisionReason: 'Added by community vote' },
      });
      await approveSubmissionTx(tx, s, now);
      return 'added';
    }
    if (no >= needed) {
      await tx.businessSubmission.update({
        where: { id: t.id },
        data: {
          status: 'REJECTED',
          reviewedAt: now,
          decisionReason: 'People nearby couldn’t find it',
        },
      });
      return 'dropped';
    }
    return 'open';
  }
  if (yes >= needed) {
    const r = await tx.placeRemoval.update({
      where: { id: t.id },
      data: { status: 'REMOVED', resolvedAt: now },
    });
    await tx.businessPlace.update({ where: { id: r.placeId }, data: { status: 'REMOVED' } });
    return 'removed';
  }
  if (no >= needed) {
    await tx.placeRemoval.update({
      where: { id: t.id },
      data: { status: 'KEPT', resolvedAt: now },
    });
    return 'kept';
  }
  return 'open';
}

/**
 * "Closed or doesn't exist?" on a place. Opens a removal request (or joins the open one)
 * with the requester's own "closed" vote. The route checks limits, account age and location.
 */
export async function requestRemoval(
  user: Pick<User, 'id'>,
  placeId: string,
  from: GeoPoint,
  now = new Date(),
) {
  const place = await db.businessPlace.findFirst({ where: { id: placeId, status: 'ACTIVE' } });
  if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found');
  let removal = await db.placeRemoval.findFirst({ where: { placeId, status: 'OPEN' } });
  if (!removal) {
    try {
      removal = await db.placeRemoval.create({
        data: { placeId, requesterId: user.id, createdAt: now },
      });
    } catch {
      // Someone opened one at the same moment (one open request per place).
      removal = await db.placeRemoval.findFirst({ where: { placeId, status: 'OPEN' } });
      if (!removal) throw new ApiError(409, 'CONFLICT', 'Please try again.');
    }
  }
  const { outcome } = await castPlaceVote(
    user,
    { kind: 'remove', id: removal.id },
    true,
    from,
    now,
  );
  return { id: removal.id, outcome };
}

/** Daily job: changes nobody decided within the window expire. */
export async function expirePlaceChanges(now = new Date()) {
  const days = await getConfig('places.changeDays');
  const before = new Date(now.getTime() - days * DAY_MS);
  const [subs, removals] = await Promise.all([
    db.businessSubmission.updateMany({
      where: { status: 'PENDING', createdAt: { lt: before } },
      data: { status: 'EXPIRED', reviewedAt: now },
    }),
    db.placeRemoval.updateMany({
      where: { status: 'OPEN', createdAt: { lt: before } },
      data: { status: 'EXPIRED', resolvedAt: now },
    }),
  ]);
  return subs.count + removals.count;
}

/** Admin: every vote on a change, newest first (who, which way, how far, when). */
export async function changeVotes(t: ChangeTarget) {
  const rows = await db.placeChangeVote.findMany({
    where: t.kind === 'add' ? { submissionId: t.id } : { removalId: t.id },
    orderBy: { createdAt: 'desc' },
    include: { voter: { select: { id: true, username: true } } },
  });
  return rows.map((v) => ({
    voter: v.voter,
    support: v.support,
    distanceMeters: v.distanceMeters,
    createdAt: v.createdAt,
  }));
}

/** Admin: removal requests (open and recent), with vote counts. */
export async function listRemovals(status: 'OPEN' | 'REMOVED' | 'KEPT' | 'EXPIRED') {
  const rows = await db.placeRemoval.findMany({
    where: { status },
    orderBy: { createdAt: status === 'OPEN' ? 'asc' : 'desc' },
    take: 200,
    include: {
      place: { select: { id: true, name: true, category: true, latitude: true, longitude: true } },
      requester: { select: { id: true, username: true } },
      resolvedBy: { select: { username: true } },
      _count: { select: { votes: true } },
    },
  });
  return Promise.all(
    rows.map(async (r) => ({
      ...r,
      votes: await changeVotes({ kind: 'remove', id: r.id }),
    })),
  );
}

/** Admin: put a removed place back (or close a request as "keep"). */
export async function adminKeepPlace(adminId: string, removalId: string, now = new Date()) {
  await db.$transaction(async (tx) => {
    const r = await tx.placeRemoval.findUnique({ where: { id: removalId } });
    if (!r) throw new ApiError(404, 'NOT_FOUND', 'Not found');
    await tx.placeRemoval.update({
      where: { id: removalId },
      data: { status: 'KEPT', resolvedAt: now, resolvedById: adminId },
    });
    await tx.businessPlace.updateMany({
      where: { id: r.placeId, status: 'REMOVED' },
      data: { status: 'ACTIVE' },
    });
  });
}

/** Admin: take a place down now (closes any open request as removed). */
export async function adminRemovePlace(adminId: string, removalId: string, now = new Date()) {
  await db.$transaction(async (tx) => {
    const r = await tx.placeRemoval.findUnique({ where: { id: removalId } });
    if (!r) throw new ApiError(404, 'NOT_FOUND', 'Not found');
    await tx.placeRemoval.update({
      where: { id: removalId },
      data: { status: 'REMOVED', resolvedAt: now, resolvedById: adminId },
    });
    await tx.businessPlace.update({ where: { id: r.placeId }, data: { status: 'REMOVED' } });
  });
}

/**
 * D101 daily job: a removed place's posts are archived (hidden, and restored with the
 * place) for `places.removedPostDays` (90). After that they're deleted for good, with their
 * comments, votes and photo files, to save storage. Posts that were reported (the post or
 * any comment on it) are kept as moderation evidence; reports and the admin log are never
 * deleted here. D146: its favorites and ratings go at the same time (until then they're
 * only hidden, so restoring the place brings them back).
 */
export async function purgeRemovedPlacePosts(now = new Date()) {
  const days = await getConfig('places.removedPostDays');
  const before = new Date(now.getTime() - days * DAY_MS);
  const places = await db.businessPlace.findMany({
    where: {
      status: 'REMOVED',
      removals: { some: { status: 'REMOVED', resolvedAt: { lt: before } } },
      // Not if it was removed again more recently (the newest removal decides).
      NOT: { removals: { some: { status: 'REMOVED', resolvedAt: { gte: before } } } },
    },
    select: { id: true },
    take: 200,
  });
  if (!places.length) return 0;
  const ids = places.map((p) => p.id);
  await db.$transaction([
    db.favoritePlace.deleteMany({ where: { placeId: { in: ids } } }),
    db.placeRating.deleteMany({ where: { placeId: { in: ids } } }),
    db.businessPlace.updateMany({
      where: { id: { in: ids } },
      data: { likeCount: 0, dislikeCount: 0 },
    }),
  ]);
  const posts = await db.businessPost.findMany({
    where: {
      placeId: { in: ids },
      reports: { none: {} },
      comments: { none: { reports: { some: {} } } },
    },
    select: { id: true, photos: { select: { id: true, storageKey: true } } },
    take: 2000,
  });
  for (const post of posts) {
    for (const ph of post.photos) {
      if (ph.storageKey)
        await objectStore()
          .delete(ph.storageKey)
          .catch(() => undefined);
    }
    await db.$transaction([
      db.photo.deleteMany({ where: { id: { in: post.photos.map((p) => p.id) } } }),
      db.businessPost.delete({ where: { id: post.id } }),
    ]);
  }
  return posts.length;
}
