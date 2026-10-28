import type { z } from 'zod';
import type { adminPlaceCreateSchema } from '@jax/shared';
import type { Prisma } from '@/generated/prisma/client';
import { audit } from '../admin/audit';
import { db } from '../db';
import { ApiError } from '../http';
import { isInServiceArea } from '../location/service-area';
import { normalizeName } from './osm';
import { approveSubmissionTx } from './submissions';

/**
 * D146: the admin portal's All places page. Find any place by name (active or removed),
 * take one down without waiting for a request, or add one without waiting for votes.
 */
export async function adminSearchPlaces(q: string) {
  const term = normalizeName(q);
  if (term.length < 2) return [];
  const rows = await db.$queryRaw<
    {
      id: string;
      name: string;
      category: string;
      address: string | null;
      status: string;
      postCount: number;
      favorites: number;
    }[]
  >`
    SELECT p.id, p.name, p.category, p.address, p.status::text, p."postCount",
           (SELECT count(*)::int FROM "FavoritePlace" f WHERE f."placeId" = p.id) AS favorites
    FROM "BusinessPlace" p
    WHERE p."nameNormalized" % ${term}::text OR p."nameNormalized" LIKE ${'%' + term + '%'}::text
    ORDER BY similarity(p."nameNormalized", ${term}::text) DESC, p.name
    LIMIT 30`;
  return rows;
}

/**
 * Adds a place now: recorded as a suggestion by the admin that's approved at once, so it
 * goes through the same steps (and duplicate guard) as any approval and shows in the
 * Places history.
 */
export async function adminCreatePlace(
  adminId: string,
  input: z.infer<typeof adminPlaceCreateSchema>,
  now = new Date(),
) {
  if (!(await isInServiceArea(db, input.latitude, input.longitude))) {
    throw new ApiError(400, 'OUTSIDE_SERVICE_AREA', 'That pin is outside Duval County.');
  }
  const placeId = await db.$transaction(async (tx) => {
    const [s] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "BusinessSubmission"
        (id, "submitterId", name, "nameNormalized", category, address, latitude, longitude,
         location, notes, status, "reviewerId", "reviewedAt", "updatedAt")
      VALUES (uuid_v7(), ${adminId}::uuid, ${input.name},
              ${normalizeName(input.name).slice(0, 200)}, ${input.category},
              ${input.address ?? null}, ${input.latitude}, ${input.longitude},
              ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography,
              'Added by an admin', 'APPROVED', ${adminId}::uuid, ${now}, ${now})
      RETURNING id`;
    const sub = {
      id: s!.id,
      name: input.name,
      category: input.category,
      address: input.address ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
      submitterId: adminId,
    };
    return (await approveSubmissionTx(tx, sub, now)).placeId;
  });
  await audit(adminId, 'PLACE_CREATE', { type: 'place', id: placeId }, {
    name: input.name,
  } as Prisma.InputJsonValue);
  return placeId;
}

/**
 * Takes a place down now, with or without a request. Recorded as a removal decided by the
 * admin (so it shows under Removals → Removed, where Keep puts it back); an open request
 * for the place is closed as removed instead of adding a second one.
 */
export async function adminRemoveAnyPlace(
  adminId: string,
  placeId: string,
  reason: string,
  now = new Date(),
) {
  await db.$transaction(async (tx) => {
    const place = await tx.businessPlace.findUnique({ where: { id: placeId } });
    if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found');
    if (place.status === 'REMOVED') {
      throw new ApiError(409, 'ALREADY_REMOVED', 'That place is already removed.');
    }
    const open = await tx.placeRemoval.findFirst({ where: { placeId, status: 'OPEN' } });
    const decided = { status: 'REMOVED' as const, resolvedAt: now, resolvedById: adminId };
    if (open) await tx.placeRemoval.update({ where: { id: open.id }, data: decided });
    else await tx.placeRemoval.create({ data: { placeId, requesterId: adminId, ...decided } });
    await tx.businessPlace.update({ where: { id: placeId }, data: { status: 'REMOVED' } });
  });
  await audit(adminId, 'PLACE_REMOVE', { type: 'place', id: placeId }, { reason });
}
