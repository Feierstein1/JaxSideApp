import type { AdminChangeDecision } from '@jax/shared';
import type { ChangeRequestStatus } from '@/generated/prisma/client';
import { db } from '../db';
import { normalizeName } from '../directory/osm';
import { ApiError } from '../http';
import { isInServiceArea } from '../location/service-area';
import { pageWindow, toPage } from './paging';

/*
 * D242 (D238 A): changes a business asks JaxSide to make. An Owner asks to change its place's
 * name, category, address or pin (the website writes `PlaceChangeRequest`); an organizer asks
 * to change its organizer name (`OrganizerNameRequest`). An admin approves (the change goes
 * live for everyone) or turns it down with a note; the business is told either way.
 */

export async function listPlaceChanges(status: ChangeRequestStatus = 'PENDING', page = 1) {
  const where = { status };
  const [rows, total] = await Promise.all([
    db.placeChangeRequest.findMany({
      where,
      orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
      ...pageWindow(page),
      include: {
        place: {
          select: {
            id: true,
            name: true,
            category: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
        account: { select: { id: true, email: true } },
      },
    }),
    db.placeChangeRequest.count({ where }),
  ]);
  return toPage(
    rows.map((r) => ({
      id: r.id,
      place: r.place,
      from: r.account.email,
      name: r.name,
      category: r.category,
      address: r.address,
      latitude: r.latitude,
      longitude: r.longitude,
      note: r.note,
      status: r.status,
      decisionNote: r.decisionNote,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
  );
}

export async function listOrganizerNameChanges(status: ChangeRequestStatus = 'PENDING', page = 1) {
  const where = { status };
  const [rows, total] = await Promise.all([
    db.organizerNameRequest.findMany({
      where,
      orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
      ...pageWindow(page),
      include: { account: { select: { id: true, email: true } } },
    }),
    db.organizerNameRequest.count({ where }),
  ]);
  return toPage(
    rows.map((r) => ({
      id: r.id,
      accountId: r.accountId,
      from: r.account.email,
      currentName: r.currentName,
      name: r.name,
      note: r.note,
      status: r.status,
      decisionNote: r.decisionNote,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
  );
}

const closed = () =>
  new ApiError(409, 'ALREADY_DECIDED', 'This request was already decided or taken back.');

/**
 * Approving changes the place for everyone (and keeps map imports from changing it back,
 * `detailsSetAt`). Refused if the asker is no longer the place's Owner, or a new pin is
 * outside Duval.
 */
export async function decidePlaceChange(
  adminId: string,
  id: string,
  d: AdminChangeDecision,
  now = new Date(),
) {
  await db.$transaction(async (tx) => {
    const [r] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "PlaceChangeRequest" WHERE id = ${id}::uuid AND status = 'PENDING' FOR UPDATE`;
    if (!r) throw closed();
    const req = await tx.placeChangeRequest.findUniqueOrThrow({
      where: { id },
      include: { place: { select: { name: true } } },
    });
    if (d.decision === 'approve') {
      const owner = await tx.businessPlaceAccess.count({
        where: { placeId: req.placeId, accountId: req.accountId, role: 'OWNER', revokedAt: null },
      });
      if (!owner) {
        throw new ApiError(409, 'NOT_OWNER', 'Whoever asked no longer runs this place.');
      }
      if (req.latitude !== null && req.longitude !== null) {
        if (!(await isInServiceArea(db, req.latitude, req.longitude))) {
          throw new ApiError(409, 'OUTSIDE_SERVICE_AREA', 'The new pin is outside Duval County.');
        }
      }
      const name = req.name;
      await tx.$executeRaw`
        UPDATE "BusinessPlace" SET
          name = COALESCE(${name}, name),
          "nameNormalized" = COALESCE(${name ? normalizeName(name).slice(0, 200) : null}, "nameNormalized"),
          category = COALESCE(${req.category}, category),
          address = COALESCE(${req.address}, address),
          latitude = COALESCE(${req.latitude}::float8, latitude),
          longitude = COALESCE(${req.longitude}::float8, longitude),
          location = CASE WHEN ${req.latitude}::float8 IS NULL THEN location
                          ELSE ST_SetSRID(ST_MakePoint(${req.longitude}::float8, ${req.latitude}::float8), 4326)::geography END,
          "detailsSetAt" = ${now}, "updatedAt" = ${now}
        WHERE id = ${req.placeId}::uuid`;
    }
    await tx.placeChangeRequest.update({
      where: { id },
      data: {
        status: d.decision === 'approve' ? 'APPROVED' : 'REJECTED',
        decisionNote: d.decision === 'reject' ? (d.note ?? null) : null,
        decidedByAdminId: adminId,
        decidedAt: now,
      },
    });
    await tx.businessNotice.create({
      data: {
        accountId: req.accountId,
        placeId: req.placeId,
        kind: d.decision === 'approve' ? 'PLACE_CHANGE_APPROVED' : 'PLACE_CHANGE_REJECTED',
        title: (d.decision === 'approve'
          ? `Your changes to ${req.name ?? req.place.name} are live`
          : `Your changes to ${req.place.name} weren’t made`
        ).slice(0, 120),
        body: d.decision === 'approve' ? 'Everyone in the app sees the new details now.' : d.note,
        link: `/places/${req.placeId}`,
        createdAt: now,
      },
    });
  });
}

export async function decideOrganizerName(
  adminId: string,
  id: string,
  d: AdminChangeDecision,
  now = new Date(),
) {
  await db.$transaction(async (tx) => {
    const [r] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "OrganizerNameRequest" WHERE id = ${id}::uuid AND status = 'PENDING' FOR UPDATE`;
    if (!r) throw closed();
    const req = await tx.organizerNameRequest.findUniqueOrThrow({ where: { id } });
    if (d.decision === 'approve') {
      const o = await tx.eventOrganizer.updateMany({
        where: { accountId: req.accountId },
        data: { name: req.name },
      });
      if (!o.count)
        throw new ApiError(409, 'NOT_ORGANIZER', 'This account has no organizer profile.');
    }
    await tx.organizerNameRequest.update({
      where: { id },
      data: {
        status: d.decision === 'approve' ? 'APPROVED' : 'REJECTED',
        decisionNote: d.decision === 'reject' ? (d.note ?? null) : null,
        decidedByAdminId: adminId,
        decidedAt: now,
      },
    });
    await tx.businessNotice.create({
      data: {
        accountId: req.accountId,
        kind: d.decision === 'approve' ? 'ORGANIZER_NAME_APPROVED' : 'ORGANIZER_NAME_REJECTED',
        title: (d.decision === 'approve'
          ? `You’re now “${req.name}” on JaxSide`
          : `Your new name “${req.name}” wasn’t approved`
        ).slice(0, 120),
        body: d.decision === 'approve' ? 'Your events show the new name now.' : d.note,
        link: '/organizer',
        createdAt: now,
      },
    });
  });
}
