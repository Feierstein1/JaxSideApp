import type { MySubmission, PlaceCandidate } from '@jax/shared';
import type { Prisma, User } from '@/generated/prisma/client';
import { evaluateAchievements } from '../achievements';
import { audit } from '../admin/audit';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import type { GeoPoint } from '../location/eligibility';
import { screenText } from '../moderation/screening';
import { enforce } from '../rate-limit';
import { normalizeName } from './osm';
import { castPlaceVote, changeVotes } from './place-changes';
import { pageWindow, toPage } from '../admin/paging';

/**
 * P5.8–P5.13 community-suggested places (§9.3, D63).
 *
 * - Anyone registered (confirmed email, account at least a day old) can suggest a
 *   missing place from where they're standing; that reading is the pin.
 * - Possible duplicates (similar name nearby, or anything right on the spot) are shown
 *   before submitting and to the admin.
 * - Suggestions never appear in the directory until an admin approves them (P5.10).
 * - Approval creates exactly one place and awards the "Approved Contributor" badge once,
 *   even on a double click or two admins at once (P5.13).
 */

const HOUR_MS = 3_600_000;
const COMMUNITY = 'community';

const point = (p: GeoPoint) => `SRID=4326;POINT(${p.longitude} ${p.latitude})`;

/** Places (and other pending suggestions) that might be the same place. */
export async function duplicateCandidates(
  at: GeoPoint,
  name: string,
  excludeSubmissionId?: string,
): Promise<{ places: PlaceCandidate[]; pending: PlaceCandidate[] }> {
  const radius = await getConfig('submission.duplicateRadiusMeters');
  const n = normalizeName(name);
  const pt = point(at);
  const places = await db.$queryRaw<
    { id: string; name: string; category: string; distance: number }[]
  >`
    SELECT p.id, p.name, p.category, ST_Distance(p.location, ${pt}::geography) AS distance
    FROM "BusinessPlace" p
    WHERE p.status = 'ACTIVE'
      AND ST_DWithin(p.location, ${pt}::geography, ${radius})
      AND (similarity(p."nameNormalized", ${n}::text) > 0.3
           OR p."nameNormalized" = ${n}::text
           OR ST_DWithin(p.location, ${pt}::geography, 20))
    ORDER BY similarity(p."nameNormalized", ${n}::text) DESC, distance ASC
    LIMIT 5`;
  const pending = await db.$queryRaw<
    { id: string; name: string; category: string; distance: number }[]
  >`
    SELECT s.id, s.name, s.category, ST_Distance(s.location, ${pt}::geography) AS distance
    FROM "BusinessSubmission" s
    WHERE s.status = 'PENDING'
      AND (${excludeSubmissionId ?? null}::uuid IS NULL OR s.id <> ${excludeSubmissionId ?? null}::uuid)
      AND ST_DWithin(s.location, ${pt}::geography, ${radius})
      AND (similarity(s."nameNormalized", ${n}::text) > 0.3 OR s."nameNormalized" = ${n}::text)
    ORDER BY distance ASC
    LIMIT 5`;
  const shape = (r: { id: string; name: string; category: string; distance: number }) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    distanceMeters: Math.round(r.distance),
  });
  return { places: places.map(shape), pending: pending.map(shape) };
}

// ───────────────────────────── Submitting ─────────────────────────────

/** D149: names that are schools or campuses (checked on the normalized name). */
const SCHOOL_WORDS =
  /\b(school|schools|elementary|preschool|pre k|prek|daycare|day care|kindergarten|montessori|university|college|campus)\b/;

export async function createSubmission(
  user: User,
  at: GeoPoint,
  input: {
    name: string;
    category: string;
    address?: string;
    notes?: string;
    confirmWarning?: true;
  },
  now = new Date(),
) {
  // D149: schools aren't places on JaxSide (minors), and campuses come from map data only.
  if (SCHOOL_WORDS.test(normalizeName(input.name))) {
    throw new ApiError(
      400,
      'SCHOOLS_NOT_ALLOWED',
      'Schools and campuses can’t be suggested. Campuses are added from map data. If this is something else, use Contact us.',
    );
  }
  const [minAgeHours, maxPending] = await Promise.all([
    getConfig('submission.minAccountAgeHours'),
    getConfig('submission.maxPending'),
  ]);
  // Risk-based limits (§9.3 step 4).
  if (now.getTime() - user.createdAt.getTime() < minAgeHours * HOUR_MS) {
    throw new ApiError(
      403,
      'ACCOUNT_TOO_NEW',
      'New accounts can suggest places after their first day. Thanks for your patience.',
    );
  }
  await enforce(
    [
      {
        key: `submission-day:user:${user.id}`,
        limitKey: 'rateLimit.submission.perDay',
        windowSeconds: 86_400,
      },
    ],
    now,
  );
  const pendingCount = await db.businessSubmission.count({
    where: { submitterId: user.id, status: 'PENDING' },
  });
  if (pendingCount >= maxPending) {
    throw new ApiError(
      429,
      'TOO_MANY_PENDING',
      'You have several suggestions waiting for review. Please wait for those first.',
    );
  }
  // Names and notes go through text screening like posts (P5.4); nothing can be held here.
  await screenText(input.name, 'edit', input);
  if (input.notes) await screenText(input.notes, 'edit', input);

  const n = normalizeName(input.name);
  if (!n) throw new ApiError(400, 'VALIDATION_ERROR', 'Enter the place’s name');
  // Your own identical suggestion still waiting: don't queue it twice.
  const mine = await db.businessSubmission.findFirst({
    where: { submitterId: user.id, status: 'PENDING', nameNormalized: n },
    select: { id: true },
  });
  if (mine) {
    throw new ApiError(
      409,
      'ALREADY_SUGGESTED',
      'You already suggested this place. It’s waiting for review.',
    );
  }

  // D94: someone else's suggestion for (almost) the same name a few yards away is the same
  // place: count this as a vote for it instead of a second entry.
  const mergeMeters = await getConfig('places.mergeMeters');
  const [similar] = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "BusinessSubmission"
    WHERE status = 'PENDING' AND "submitterId" <> ${user.id}::uuid
      AND ST_DWithin(location, ${point(at)}::geography, ${mergeMeters})
      AND ("nameNormalized" = ${n} OR similarity("nameNormalized", ${n}::text) >= 0.6)
    ORDER BY similarity("nameNormalized", ${n}::text) DESC
    LIMIT 1`;
  if (similar) {
    try {
      await castPlaceVote(user, { kind: 'add', id: similar.id }, true, at, now);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_VOTED') {
        throw new ApiError(
          409,
          'ALREADY_SUGGESTED',
          'Someone already suggested this place and your vote is counted.',
        );
      }
      throw err;
    }
    return {
      id: similar.id,
      merged: true,
      duplicates: await duplicateCandidates(at, input.name, similar.id),
    };
  }

  const [row] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO "BusinessSubmission"
      (id, "submitterId", name, "nameNormalized", category, address, latitude, longitude,
       location, notes, "createdAt", "updatedAt")
    VALUES (uuid_v7(), ${user.id}::uuid, ${input.name}, ${n.slice(0, 200)}, ${input.category},
            ${input.address || null}, ${at.latitude}, ${at.longitude}, ${point(at)}::geography,
            ${input.notes || null}, ${now}, ${now})
    RETURNING id`;
  // D94: the suggester's own "It's here" is the first vote.
  await db.placeChangeVote.create({
    data: {
      voterId: user.id,
      submissionId: row!.id,
      support: true,
      distanceMeters: 0,
      createdAt: now,
    },
  });
  return {
    id: row!.id,
    merged: false,
    duplicates: await duplicateCandidates(at, input.name, row!.id),
  };
}

export async function listMySubmissions(userId: string): Promise<MySubmission[]> {
  const rows = await db.businessSubmission.findMany({
    where: { submitterId: userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    status: s.status,
    decisionReason: s.status === 'REJECTED' || s.status === 'DUPLICATE' ? s.decisionReason : null,
    placeId: s.placeId,
    createdAt: s.createdAt.toISOString(),
  }));
}

// ───────────────────────────── Admin queue ─────────────────────────────

/** The suggestion queue (waiting ones oldest first), 20 a page (D210). */
export async function listSubmissions(filter: {
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DUPLICATE' | 'MERGED' | 'EXPIRED';
  category?: string;
  submitter?: string;
  since?: Date;
  page?: number;
}) {
  const page = filter.page ?? 1;
  const where: Prisma.BusinessSubmissionWhereInput = {
    status: filter.status ?? 'PENDING',
    ...(filter.category ? { category: filter.category } : {}),
    ...(filter.submitter
      ? { submitter: { usernameNormalized: { startsWith: filter.submitter.toLowerCase() } } }
      : {}),
    ...(filter.since ? { createdAt: { gte: filter.since } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.businessSubmission.findMany({
      where,
      orderBy: [
        { createdAt: filter.status && filter.status !== 'PENDING' ? 'desc' : 'asc' },
        { id: 'asc' },
      ],
      ...pageWindow(page),
      include: { submitter: { select: { id: true, username: true, status: true } } },
    }),
    db.businessSubmission.count({ where }),
  ]);
  const list = await Promise.all(
    rows.map(async (s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      address: s.address,
      notes: s.notes,
      latitude: s.latitude,
      longitude: s.longitude,
      status: s.status,
      decisionReason: s.decisionReason,
      createdAt: s.createdAt.toISOString(),
      submitter: s.submitter,
      duplicates:
        s.status === 'PENDING'
          ? await duplicateCandidates(s, s.name, s.id)
          : { places: [], pending: [] },
      // D94: the community's votes on it.
      votes: (await changeVotes({ kind: 'add', id: s.id })).map((v) => ({
        ...v,
        createdAt: v.createdAt.toISOString(),
      })),
    })),
  );
  return toPage(list, total, page);
}

/** How the submitter's earlier suggestions went (helps judge new ones). */
export async function submitterHistory(userIds: string[]) {
  const rows = await db.businessSubmission.groupBy({
    by: ['submitterId', 'status'],
    where: { submitterId: { in: userIds } },
    _count: true,
  });
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) (out[r.submitterId] ??= {})[r.status] = r._count;
  return out;
}

type Decision =
  | { decision: 'approve'; name?: string; category?: string; address?: string }
  | { decision: 'reject'; reason: string }
  | { decision: 'merge'; placeId: string };

async function approvedContributorTier(tx: Prisma.TransactionClient, userId: string) {
  const r = await tx.userAchievement.findFirst({
    where: { userId, achievement: { key: 'approved_contributor' } },
    select: { tier: true },
  });
  return r?.tier ?? 0;
}

/**
 * Creates the place for an approved suggestion and gives the suggester the Approved
 * Contributor medal (or its next level, D122). Used by an admin's decision and by community votes (D94).
 */
export async function approveSubmissionTx(
  tx: Prisma.TransactionClient,
  s: {
    id: string;
    name: string;
    category: string;
    address: string | null;
    latitude: number;
    longitude: number;
    submitterId: string;
  },
  now: Date,
  d: { name?: string; category?: string; address?: string } = {},
): Promise<{ placeId: string; badge: boolean }> {
  const name = d.name ?? s.name;
  const [place] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "BusinessPlace"
      (id, name, "nameNormalized", category, address, latitude, longitude, location,
       status, "sourceName", "sourceId", "createdAt", "updatedAt")
    VALUES (uuid_v7(), ${name}, ${normalizeName(name).slice(0, 200)},
            ${d.category ?? s.category}, ${d.address ?? s.address}, ${s.latitude}, ${s.longitude},
            ${point(s)}::geography, 'ACTIVE', ${COMMUNITY}, ${s.id}, ${now}, ${now})
    ON CONFLICT ("sourceName", "sourceId") DO NOTHING
    RETURNING id`;
  if (!place) throw new ApiError(409, 'ALREADY_DECIDED', 'Already decided');
  await tx.businessSubmission.update({
    where: { id: s.id },
    data: {
      placeId: place.id,
      ...(d.name ? { name: d.name, nameNormalized: normalizeName(d.name).slice(0, 200) } : {}),
      ...(d.category ? { category: d.category } : {}),
      ...(d.address ? { address: d.address } : {}),
    },
  });
  // §9.3: the medal comes only with approval. D122: `badge` is true when this approval
  // earned the Approved Contributor medal or raised its level.
  const before = await approvedContributorTier(tx, s.submitterId);
  await evaluateAchievements(now, s.submitterId, tx);
  const after = await approvedContributorTier(tx, s.submitterId);
  return { placeId: place.id, badge: after > before };
}

/**
 * Decides one suggestion. The PENDING → decided claim happens first inside the
 * transaction, so a second click or a second admin gets 409 and nothing is created
 * twice (P5.13). The place's (sourceName, sourceId) uniqueness is a second guard.
 */
export async function decideSubmission(adminId: string, id: string, d: Decision, now = new Date()) {
  const result = await db.$transaction(async (tx) => {
    const s = await tx.businessSubmission.findUnique({ where: { id } });
    if (!s) throw new ApiError(404, 'NOT_FOUND', 'Submission not found');
    const status =
      d.decision === 'approve' ? 'APPROVED' : d.decision === 'reject' ? 'REJECTED' : 'MERGED';
    const claimed = await tx.businessSubmission.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status,
        reviewerId: adminId,
        reviewedAt: now,
        decisionReason: d.decision === 'reject' ? d.reason : null,
      },
    });
    if (claimed.count !== 1) throw new ApiError(409, 'ALREADY_DECIDED', 'Already decided');

    if (d.decision === 'reject') return { status, placeId: null as string | null, badge: false };

    if (d.decision === 'merge') {
      const target = await tx.businessPlace.findFirst({
        where: { id: d.placeId, status: 'ACTIVE' },
      });
      if (!target) throw new ApiError(404, 'NOT_FOUND', 'Place to merge into not found');
      await tx.businessSubmission.update({ where: { id }, data: { placeId: target.id } });
      return { status, placeId: target.id, badge: false };
    }

    const { placeId, badge } = await approveSubmissionTx(tx, s, now, d);
    return { status, placeId, badge };
  });
  await audit(adminId, `SUBMISSION_${result.status}`, { type: 'submission', id }, {
    placeId: result.placeId,
    ...(d.decision === 'reject' ? { reason: d.reason } : {}),
  } as Prisma.InputJsonValue);
  return result;
}

/** P5.12 bulk approve/reject: each item independently; failures are listed, not fatal. */
export async function decideMany(
  adminId: string,
  ids: string[],
  d: { decision: 'approve' } | { decision: 'reject'; reason: string },
) {
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      await decideSubmission(adminId, id, d);
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err instanceof ApiError ? err.message : 'Failed' });
    }
  }
  return results;
}
