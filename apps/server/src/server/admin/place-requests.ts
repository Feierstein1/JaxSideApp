import { FREE_TIER_DAYS, type adminPlaceRequestDecisionSchema } from '@jax/shared';
import type { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { adminCreatePlace } from '../directory/admin-places';
import { ApiError } from '../http';
import { audit } from './audit';
import { pageWindow, toPage } from './paging';

/**
 * D185 / D224 (B6.4): requests from the owner website, in the admin portal's Owners page.
 * "Ask JaxSide to verify me" names an existing place; "Add my business" brings a new one
 * (name, kind, address and the pin the owner confirmed). Approving adds a new place to the
 * map (inside Duval, with the usual duplicate guard, as if an admin added it), gives the
 * business Owner access (verified by JaxSide) and starts its free month if it hasn't had
 * one (D202). Turning it down tells the business why. Personal app accounts are never
 * involved (D185): this is only between the business login and JaxSide.
 */

const DAY_MS = 86_400_000;
const PENDING = 'PENDING' as const;

export async function listPlaceRequests(status: 'PENDING' | 'APPROVED' | 'REJECTED', page = 1) {
  const where = { status };
  const [rows, total] = await Promise.all([
    db.businessVerificationRequest.findMany({
      where,
      orderBy: [{ createdAt: status === PENDING ? 'asc' : 'desc' }, { id: 'asc' }],
      ...pageWindow(page),
      include: {
        account: { select: { id: true, email: true, username: true, createdById: true } },
        place: { select: { id: true, name: true, address: true, status: true } },
      },
    }),
    db.businessVerificationRequest.count({ where }),
  ]);
  const list = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      kind: r.placeId ? ('verify' as const) : ('new' as const),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString() ?? null,
      decisionNote: r.decisionNote,
      business: { id: r.account.id, login: r.account.email ?? r.account.username ?? '' },
      contact: { name: r.contactName, phone: r.contactPhone },
      note: r.note,
      place: r.place,
      typed: {
        name: r.placeName,
        address: r.placeAddress,
        category: r.category,
        pin:
          r.latitude !== null && r.longitude !== null
            ? { latitude: r.latitude, longitude: r.longitude }
            : null,
      },
      // A place it would join: an existing place's Owner, or a nearby place with a like name.
      hasOwner: r.placeId ? await placeHasOwner(r.placeId) : false,
      nearby:
        !r.placeId && r.latitude !== null && r.longitude !== null && status === PENDING
          ? await nearbyPlaces(r.latitude, r.longitude)
          : [],
    })),
  );
  return toPage(list, total, page);
}

async function placeHasOwner(placeId: string, tx: Prisma.TransactionClient = db) {
  return !!(await tx.businessPlaceAccess.findFirst({
    where: { placeId, role: 'OWNER', revokedAt: null },
    select: { id: true },
  }));
}

/** Places within 150 m of the pin (the admin checks it isn't one of them before adding). */
async function nearbyPlaces(latitude: number, longitude: number) {
  return db.$queryRaw<{ id: string; name: string; address: string | null; meters: number }[]>`
    SELECT id, name, address,
           round(ST_Distance(location, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography))::int AS meters
    FROM "BusinessPlace"
    WHERE status = 'ACTIVE'
      AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography, 150)
    ORDER BY meters LIMIT 5`;
}

/** D202: the business's free month, if neither it nor the place has had one (never fails). */
async function grantFreeMonth(
  tx: Prisma.TransactionClient,
  ownerId: string,
  placeId: string,
  now: Date,
) {
  const free = await tx.plan.findFirst({
    where: { code: 'FREE', active: true },
    select: { id: true, durationDays: true },
  });
  if (!free) return;
  const endsAt = new Date(now.getTime() + (free.durationDays ?? FREE_TIER_DAYS) * DAY_MS);
  // ON CONFLICT: the business or the place already had its free month, or it has a plan.
  await tx.$executeRaw`
    INSERT INTO "Subscription"
      (id, "accountId", "planId", status, source, "startsAt", "endsAt", "freeTierPlaceId",
       "currentPeriodStart", "currentPeriodEnd", "createdAt")
    VALUES (gen_random_uuid(), ${ownerId}::uuid, ${free.id}::uuid, 'ACTIVE', 'FREE_TIER',
       ${now}, ${endsAt}, ${placeId}::uuid, ${now}, ${endsAt}, ${now})
    ON CONFLICT DO NOTHING`;
}

export async function decidePlaceRequest(
  adminId: string,
  id: string,
  input: z.infer<typeof adminPlaceRequestDecisionSchema>,
  now = new Date(),
) {
  const r = await db.businessVerificationRequest.findUnique({
    where: { id },
    include: { account: { select: { id: true, createdById: true, revokedAt: true } } },
  });
  if (!r) throw new ApiError(404, 'NOT_FOUND', 'Request not found');
  if (r.status !== PENDING) throw new ApiError(409, 'STATE', 'This request was already decided.');

  if (input.decision === 'reject') {
    await db.$transaction(async (tx) => {
      await tx.businessVerificationRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          decidedAt: now,
          decidedByAdminId: adminId,
          decisionNote: input.note!,
        },
      });
      await tx.businessNotice.create({
        data: {
          accountId: r.accountId,
          placeId: r.placeId,
          kind: 'FROM_JAXSIDE',
          title: `About ${r.placeName}`.slice(0, 120),
          body: input.note!,
          createdAt: now,
        },
      });
      await audit(
        adminId,
        'PLACE_REQUEST_REJECT',
        { type: 'place-request', id },
        {
          note: input.note!,
        },
        tx,
      );
    });
    return { placeId: null };
  }

  // Only an Owner account (not a staff login) that's still active gets a place.
  if (r.account.createdById || r.account.revokedAt) {
    throw new ApiError(409, 'NOT_OWNER_ACCOUNT', 'Only an active owner login can get a place.');
  }
  let placeId = input.usePlaceId ?? r.placeId;
  if (!placeId) {
    if (r.latitude === null || r.longitude === null || !r.category) {
      throw new ApiError(
        409,
        'NEEDS_PIN',
        'This new place has no pin or kind. Ask the business to send it again from the website.',
      );
    }
    // The same path as an admin adding a place: inside Duval, duplicate guard, history.
    placeId = await adminCreatePlace(
      adminId,
      {
        name: r.placeName,
        category: r.category,
        address: r.placeAddress ?? undefined,
        latitude: r.latitude,
        longitude: r.longitude,
      },
      now,
    );
  }
  const finalPlaceId = placeId;
  await db.$transaction(async (tx) => {
    // One Owner per place (also a partial unique index); never take a place from its owner.
    if (await placeHasOwner(finalPlaceId, tx)) {
      throw new ApiError(
        409,
        'PLACE_HAS_OWNER',
        'This place already has an owner. Move it on the business page if it changed hands.',
      );
    }
    const updated = await tx.businessVerificationRequest.updateMany({
      where: { id, status: PENDING },
      data: {
        status: 'APPROVED',
        decidedAt: now,
        decidedByAdminId: adminId,
        placeId: finalPlaceId,
      },
    });
    if (updated.count === 0) throw new ApiError(409, 'STATE', 'This request was already decided.');
    await tx.businessPlaceAccess.create({
      data: {
        accountId: r.accountId,
        placeId: finalPlaceId,
        role: 'OWNER',
        verifiedBy: 'ADMIN',
        verifiedAt: now,
        createdAt: now,
      },
    });
    await grantFreeMonth(tx, r.accountId, finalPlaceId, now);
    await tx.businessNotice.create({
      data: {
        accountId: r.accountId,
        placeId: finalPlaceId,
        kind: 'PLACE_ADDED',
        title: `You run ${r.placeName} on JaxSide now`.slice(0, 120),
        body: r.placeId
          ? 'JaxSide verified you as the owner.'
          : 'JaxSide added your place to the map and verified you as the owner.',
        link: `/places/${finalPlaceId}`,
        createdAt: now,
      },
    });
    await audit(
      adminId,
      'PLACE_REQUEST_APPROVE',
      { type: 'place-request', id },
      {
        placeId: finalPlaceId,
        newPlace: !r.placeId && !input.usePlaceId,
      },
      tx,
    );
  });
  return { placeId: finalPlaceId };
}
