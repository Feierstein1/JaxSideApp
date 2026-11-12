import {
  censusGeocodeUrl,
  localDate,
  localTime,
  parseCensusGeocode,
  type AdminEventDecision,
  type EventInputParsed,
  type SessionInput,
} from '@jax/shared';
import type { Event, EventStatus, Prisma } from '@/generated/prisma/client';
import { pageWindow, toPage } from '../admin/paging';
import { db } from '../db';
import { ApiError } from '../http';
import { nearestNeighborhood } from '../location/neighborhood';
import { isInServiceArea } from '../location/service-area';
import { notifyFollowers } from './notify';
import {
  assertHostPlace,
  copyEventImages,
  eventColumns,
  hostKey,
  nextYear,
  resolveWhere,
  settingKey,
  syncSessions,
  zipAt,
} from './save';

/*
 * D230: the admin portal's Events pages. The owner seeds the calendar here before launch
 * (admin events are approved at once), and reviews everything else: the website's business and
 * organizer events (and any app suggestions left from before D233). Every action is audited by the route.
 */

export const ADMIN_EVENT_TABS = {
  waiting: ['SUGGESTED', 'IN_REVIEW'],
  upcoming: ['APPROVED', 'CANCELLED'],
  past: ['APPROVED', 'CANCELLED'],
  closed: ['DENIED', 'REMOVED'],
} as const satisfies Record<string, EventStatus[]>;
export type AdminEventTab = keyof typeof ADMIN_EVENT_TABS;

export async function adminListEvents(opts: { tab: AdminEventTab; q?: string; page?: number }) {
  const page = opts.page ?? 1;
  const now = new Date();
  const where: Prisma.EventWhereInput = {
    status: { in: [...ADMIN_EVENT_TABS[opts.tab]] },
    ...(opts.tab === 'upcoming' ? { lastEndsAt: { gte: now } } : {}),
    ...(opts.tab === 'past' ? { lastEndsAt: { lt: now } } : {}),
    ...(opts.q ? { title: { contains: opts.q, mode: 'insensitive' } } : {}),
  };
  const orderBy: Prisma.EventOrderByWithRelationInput[] =
    opts.tab === 'past'
      ? [{ lastEndsAt: 'desc' }, { id: 'desc' }]
      : opts.tab === 'upcoming'
        ? [{ firstStartsAt: 'asc' }, { id: 'asc' }]
        : [{ createdAt: 'desc' }, { id: 'desc' }];
  const [rows, total] = await Promise.all([
    db.event.findMany({
      where,
      orderBy,
      ...pageWindow(page),
      include: {
        place: { select: { name: true } },
        businessAccount: { select: { email: true } },
        createdBy: { select: { username: true, role: true } },
        _count: { select: { sessions: true, follows: true, images: true } },
      },
    }),
    db.event.count({ where }),
  ]);
  return toPage(
    rows.map((e) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      host: hostKey(e.hostKind),
      where: e.venueName ?? e.place?.name ?? e.address ?? e.neighborhood ?? '',
      neighborhood: e.neighborhood,
      zip: e.zip,
      firstStartsAt: e.firstStartsAt?.toISOString() ?? null,
      lastEndsAt: e.lastEndsAt?.toISOString() ?? null,
      sessions: e._count.sessions,
      follows: e._count.follows,
      images: e._count.images,
      from: e.businessAccountId
        ? `Website (${e.businessAccount?.email ?? 'business'})`
        : e.createdBy
          ? e.createdBy.role === 'ADMIN'
            ? `Admin ${e.createdBy.username}`
            : `Suggested by ${e.createdBy.username}`
          : 'Unknown',
      createdAt: e.createdAt.toISOString(),
    })),
    total,
    page,
  );
}

/** Everything the edit page needs, sessions as typed (Jacksonville dates and times). */
export async function adminGetEvent(id: string) {
  const e = await db.event.findUnique({
    where: { id },
    include: {
      sessions: { orderBy: { startsAt: 'asc' } },
      images: { orderBy: { position: 'asc' } },
      place: { select: { id: true, name: true, address: true } },
      hostPlace: { select: { id: true, name: true } },
      businessAccount: { select: { id: true, email: true } },
      createdBy: { select: { id: true, username: true, role: true } },
      _count: { select: { follows: true } },
    },
  });
  if (!e) throw new ApiError(404, 'NOT_FOUND', 'Event not found');
  return {
    id: e.id,
    status: e.status,
    hostKind: hostKey(e.hostKind),
    title: e.title,
    description: e.description,
    category: e.category,
    setting: settingKey(e.setting),
    free: e.free,
    priceText: e.priceText,
    adultsOnly: e.adultsOnly,
    familyFriendly: e.familyFriendly,
    place: e.place,
    // D236: a business event's own place, the venue question, and its link.
    hostPlace: e.hostPlace,
    venueStatus: e.venueStatus,
    venueAnsweredAt: e.venueAnsweredAt?.toISOString() ?? null,
    linkUrl: e.linkUrl,
    linkLabel: e.linkLabel,
    venueName: e.venueName,
    address: e.address,
    latitude: e.latitude,
    longitude: e.longitude,
    zip: e.zip,
    neighborhood: e.neighborhood,
    chatRadiusMeters: e.chatRadiusMeters,
    sessions: e.sessions.map((s): SessionInput => ({
      date: localDate(s.startsAt),
      start: localTime(s.startsAt),
      end: localTime(s.endsAt),
    })),
    // Admin-only link (cookie session), so pictures of events still in review show too.
    images: e.images.map((i) => ({ id: i.id, url: `/api/v1/admin/events/${e.id}/images/${i.id}` })),
    businessAccount: e.businessAccount,
    createdBy: e.createdBy,
    follows: e._count.follows,
    decisionReason: e.decisionReason,
    cancelReason: e.cancelReason,
    createdAt: e.createdAt.toISOString(),
  };
}

async function eventOr404(id: string) {
  const e = await db.event.findUnique({ where: { id } });
  if (!e) throw new ApiError(404, 'NOT_FOUND', 'Event not found');
  return e;
}

/** An admin adds an event: approved at once (the owner seeds the calendar). */
export async function adminCreateEvent(adminId: string, input: EventInputParsed, now = new Date()) {
  const where = await resolveWhere(input);
  await assertHostPlace(input);
  return db.$transaction(async (tx) => {
    const e = await tx.event.create({
      data: {
        ...eventColumns(input),
        ...where,
        status: 'APPROVED',
        createdById: adminId,
        reviewedById: adminId,
        reviewedAt: now,
      },
    });
    await syncSessions(tx, e.id, input.sessions);
    return e.id;
  });
}

/**
 * An admin changes an event (any status; a suggestion gets its pin this way before it's
 * approved). Followers of an approved event are told when its dates, times or place change.
 */
export async function adminUpdateEvent(id: string, input: EventInputParsed) {
  const before = await eventOr404(id);
  const where = await resolveWhere(input);
  await assertHostPlace(input);
  // D236: a new venue place means a new question (asked again when it's approved).
  const venue =
    before.placeId !== where.placeId ? { venueStatus: 'NONE' as const, venueAnsweredAt: null } : {};
  const changed = await db.$transaction(async (tx) => {
    await tx.event.update({
      where: { id },
      data: { ...eventColumns(input), ...where, ...venue },
    });
    const datesChanged = await syncSessions(tx, id, input.sessions);
    const moved =
      before.latitude !== where.latitude ||
      before.longitude !== where.longitude ||
      before.placeId !== where.placeId;
    return datesChanged || moved;
  });
  if (changed && before.status === 'APPROVED') await notifyFollowers(id, 'EVENT_CHANGED');
}

/** Moves the event from one of `from` to `to`, refusing if someone else changed it first. */
async function move(
  e: Event,
  from: EventStatus[],
  data: Prisma.EventUpdateManyMutationInput & { status: EventStatus },
) {
  if (!from.includes(e.status)) {
    throw new ApiError(409, 'WRONG_STATUS', `This event is ${e.status.toLowerCase()}.`);
  }
  const r = await db.event.updateMany({ where: { id: e.id, status: e.status }, data });
  if (r.count !== 1) throw new ApiError(409, 'ALREADY_DECIDED', 'Someone changed it first.');
}

/** D230: tells the business or organizer on the website that its event was decided. */
async function tellBusiness(e: Event, approved: boolean, reason: string | null, now: Date) {
  if (!e.businessAccountId) return;
  await db.businessNotice.create({
    data: {
      accountId: e.businessAccountId,
      placeId: e.placeId,
      kind: approved ? 'EVENT_APPROVED' : 'EVENT_DENIED',
      title: (approved
        ? `Your event “${e.title}” is on the calendar`
        : `Your event “${e.title}” needs changes`
      ).slice(0, 120),
      body: approved ? 'People can find and follow it in the app now.' : reason,
      link: `/events/${e.id}`,
      createdAt: now,
    },
  });
}

/**
 * D236 (D232): an approved event from the website held at someone else's place: that place's
 * Owner is asked whether it's really there (a notice on the website, which also emails it).
 * The event doesn't wait. Nothing to ask for the host's own place, a place without a verified
 * owner, an event JaxSide added, or one already asked or answered.
 */
async function askVenue(e: Event, now: Date) {
  if (!e.businessAccountId || !e.placeId || e.placeId === e.hostPlaceId) return;
  if (e.venueStatus !== 'NONE') return;
  const owner = await db.businessPlaceAccess.findFirst({
    where: { placeId: e.placeId, role: 'OWNER', revokedAt: null },
    select: { accountId: true, place: { select: { name: true } } },
  });
  if (!owner || owner.accountId === e.businessAccountId) return;
  const asked = await db.event.updateMany({
    where: { id: e.id, venueStatus: 'NONE' },
    data: { venueStatus: 'ASKED' },
  });
  if (!asked.count) return;
  await db.businessNotice.create({
    data: {
      accountId: owner.accountId,
      placeId: e.placeId,
      kind: 'EVENT_AT_YOUR_PLACE',
      title: `“${e.title}” is listed at ${owner.place.name}`.slice(0, 120),
      body: 'Is this event held at your place? Say yes and the app shows it as confirmed by you; say no and JaxSide takes a look.',
      link: `/events/${e.id}/venue`,
      createdAt: now,
    },
  });
}

export async function adminDecideEvent(
  adminId: string,
  id: string,
  d: AdminEventDecision,
  now = new Date(),
) {
  const e = await eventOr404(id);
  switch (d.action) {
    case 'approve': {
      if (e.latitude === null) {
        throw new ApiError(
          409,
          'NEEDS_PIN',
          'Set the event’s place or pin (Edit) before approving.',
        );
      }
      if (!(await db.eventSession.count({ where: { eventId: id } }))) {
        throw new ApiError(409, 'NEEDS_DATES', 'Add at least one date before approving.');
      }
      // The website can't name neighborhoods (the list lives here), and its pins aren't
      // checked here otherwise: set the ZIP and neighborhood, and refuse a pin outside Duval.
      if (!(await isInServiceArea(db, e.latitude, e.longitude!))) {
        throw new ApiError(
          409,
          'OUTSIDE_SERVICE_AREA',
          'This event’s pin is outside Duval County.',
        );
      }
      await db.event.update({
        where: { id },
        data: {
          zip: await zipAt(e.latitude, e.longitude!),
          neighborhood: nearestNeighborhood({ latitude: e.latitude, longitude: e.longitude! }),
        },
      });
      await move(e, ['SUGGESTED', 'IN_REVIEW', 'DENIED'], {
        status: 'APPROVED',
        reviewedById: adminId,
        reviewedAt: now,
        decisionReason: null,
      });
      await tellBusiness(e, true, null, now);
      return askVenue(e, now);
    }
    case 'deny':
      await move(e, ['SUGGESTED', 'IN_REVIEW'], {
        status: 'DENIED',
        reviewedById: adminId,
        reviewedAt: now,
        decisionReason: d.reason,
      });
      return tellBusiness(e, false, d.reason, now);
    case 'cancel':
      await move(e, ['APPROVED'], {
        status: 'CANCELLED',
        cancelledAt: now,
        cancelReason: d.reason,
      });
      await notifyFollowers(id, 'EVENT_CANCELLED');
      return;
    case 'remove':
      return move(e, ['SUGGESTED', 'DRAFT', 'IN_REVIEW', 'APPROVED', 'CANCELLED', 'DENIED'], {
        status: 'REMOVED',
        decisionReason: d.reason,
        reviewedById: adminId,
        reviewedAt: now,
      });
    case 'restore':
      return move(e, ['CANCELLED', 'REMOVED'], {
        status: 'APPROVED',
        cancelledAt: null,
        cancelReason: null,
      });
  }
}

/**
 * D230: Duplicate (same dates, to edit) or Repeat yearly (every date a year later). The copy
 * waits in review so it never shows twice by accident; its pictures are copied too.
 */
export async function adminCopyEvent(adminId: string, id: string, years: number) {
  const e = await db.event.findUnique({ where: { id }, include: { sessions: true } });
  if (!e) throw new ApiError(404, 'NOT_FOUND', 'Event not found');
  if (e.latitude === null) throw new ApiError(409, 'NEEDS_PIN', 'Set a pin before copying.');
  const sessions = e.sessions.map((s): SessionInput => {
    const date = localDate(s.startsAt);
    return {
      date: years ? nextYear(date) : date,
      start: localTime(s.startsAt),
      end: localTime(s.endsAt),
    };
  });
  const {
    id: _id,
    createdAt: _c,
    updatedAt: _u,
    firstStartsAt: _f,
    lastEndsAt: _l,
    sessions: _s,
    ...rest
  } = e;
  const copyId = await db.$transaction(async (tx) => {
    const c = await tx.event.create({
      data: {
        ...rest,
        status: 'IN_REVIEW',
        createdById: adminId,
        submittedAt: new Date(),
        reviewedById: null,
        reviewedAt: null,
        decisionReason: null,
        cancelledAt: null,
        cancelReason: null,
      },
    });
    await syncSessions(tx, c.id, sessions);
    return c.id;
  });
  await copyEventImages(id, copyId);
  return copyId;
}

/** D224: an address → a pin, with the US Census geocoder (free, no key). Null if not found. */
export async function geocodeAddress(address: string) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8_000);
  try {
    const res = await fetch(censusGeocodeUrl(address), { signal: ctl.signal });
    if (!res.ok) return null;
    return parseCensusGeocode(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
