import { randomBytes } from 'node:crypto';
import {
  addDays,
  EVENT_IMAGES_MAX,
  sessionInstants,
  type EventHostKind,
  type EventInputParsed,
  type EventSetting,
  type SessionInput,
} from '@jax/shared';
import type { Event, Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { ApiError } from '../http';
import { nearestNeighborhood } from '../location/neighborhood';
import { isInServiceArea } from '../location/service-area';
import { processImage } from '../media/photos';
import { objectStore } from '../media/store';

/*
 * D230: writing events (admin portal, approving a suggestion). The business website writes
 * the same tables with its own copy of these rules; the database keeps each event's first
 * start and last end in step with its sessions (trigger `EventSession_bounds`).
 */

const HOST = { community: 'COMMUNITY', business: 'BUSINESS', organizer: 'ORGANIZER' } as const;
const SETTING = { indoor: 'INDOOR', outdoor: 'OUTDOOR', mixed: 'MIXED' } as const;

export const settingKey = (s: Event['setting']): EventSetting =>
  s === 'INDOOR' ? 'indoor' : s === 'MIXED' ? 'mixed' : 'outdoor';
export const hostKey = (h: Event['hostKind']): EventHostKind =>
  h === 'BUSINESS' ? 'business' : h === 'ORGANIZER' ? 'organizer' : 'community';

/** The ZIP code area (Census outline) a point falls in, or null. */
export async function zipAt(latitude: number, longitude: number) {
  const [row] = await db.$queryRaw<{ zip: string }[]>`
    SELECT zip FROM "ZipArea"
    WHERE ST_Intersects(geom, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography)
    LIMIT 1`;
  return row?.zip ?? null;
}

/**
 * Where the event is: a place (its pin, and its address unless one is given) or a pin.
 * The pin must be inside Duval (D15, D230). Also labels the ZIP and neighborhood.
 */
export async function resolveWhere(input: {
  placeId?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  venueName?: string;
}) {
  let latitude = input.latitude;
  let longitude = input.longitude;
  let address = input.address ?? null;
  if (input.placeId) {
    const place = await db.businessPlace.findFirst({
      where: { id: input.placeId, status: 'ACTIVE' },
      select: { latitude: true, longitude: true, address: true },
    });
    if (!place) throw new ApiError(404, 'PLACE_NOT_FOUND', 'That place isn’t in the directory.');
    latitude = place.latitude;
    longitude = place.longitude;
    address ??= place.address;
  }
  if (latitude === undefined || longitude === undefined) {
    throw new ApiError(400, 'NEEDS_PIN', 'Pick a place or set a pin.');
  }
  if (!(await isInServiceArea(db, latitude, longitude))) {
    throw new ApiError(400, 'OUTSIDE_SERVICE_AREA', 'Events must be in Duval County.');
  }
  return {
    placeId: input.placeId ?? null,
    venueName: input.venueName ?? null,
    address,
    latitude,
    longitude,
    zip: await zipAt(latitude, longitude),
    neighborhood: nearestNeighborhood({ latitude, longitude }),
  };
}

/** The columns an input sets (everything but status, who and where). */
export function eventColumns(input: EventInputParsed) {
  return {
    title: input.title,
    description: input.description,
    category: input.category,
    hostKind: HOST[input.hostKind],
    setting: SETTING[input.setting],
    free: input.free,
    priceText: input.free ? null : (input.priceText ?? null),
    adultsOnly: input.adultsOnly,
    familyFriendly: input.familyFriendly,
    chatRadiusMeters: input.chatRadiusMeters,
  } satisfies Partial<Prisma.EventUncheckedCreateInput>;
}

/**
 * Makes the event's sessions match the list, keeping the rows whose start didn't change (so
 * their chat, "I'm here" answers and reminders stay with them). Returns whether any date or
 * time changed (followers are told about changes).
 */
export async function syncSessions(
  tx: Prisma.TransactionClient,
  eventId: string,
  list: SessionInput[],
): Promise<boolean> {
  const wanted = list.map(sessionInstants);
  const have = await tx.eventSession.findMany({ where: { eventId } });
  const key = (d: Date) => d.getTime();
  const wantedByStart = new Map(wanted.map((w) => [key(w.startsAt), w]));
  let changed = false;
  for (const h of have) {
    const w = wantedByStart.get(key(h.startsAt));
    if (!w) {
      await tx.eventSession.delete({ where: { id: h.id } });
      changed = true;
    } else if (key(w.endsAt) !== key(h.endsAt)) {
      await tx.eventSession.update({ where: { id: h.id }, data: { endsAt: w.endsAt } });
      changed = true;
    }
  }
  const haveStarts = new Set(have.map((h) => key(h.startsAt)));
  const fresh = wanted.filter((w) => !haveStarts.has(key(w.startsAt)));
  if (fresh.length) {
    await tx.eventSession.createMany({ data: fresh.map((w) => ({ eventId, ...w })) });
    changed = true;
  }
  return changed;
}

/** A year later on the same date (Feb 29 becomes Mar 1). */
export function nextYear(date: string) {
  const [y, rest] = [Number(date.slice(0, 4)), date.slice(4)];
  const same = `${y + 1}${rest}`;
  return rest === '-02-29' ? addDays(`${y + 1}-02-28`, 1) : same;
}

// ───────────────────────────── Pictures ─────────────────────────────

/** Adds a cleaned picture (no metadata, at most 1600 px) to an event; at most 6 each. */
export async function addEventImage(eventId: string, body: Buffer) {
  const count = await db.eventImage.count({ where: { eventId } });
  if (count >= EVENT_IMAGES_MAX) {
    throw new ApiError(
      409,
      'TOO_MANY_IMAGES',
      `An event can have up to ${EVENT_IMAGES_MAX} pictures.`,
    );
  }
  const clean = await processImage(body);
  const ext = clean.mimeType === 'image/gif' ? 'gif' : 'jpg';
  const storageKey = `events/${randomBytes(24).toString('hex')}.${ext}`;
  await objectStore().put(storageKey, clean.data, clean.mimeType);
  const last = await db.eventImage.findFirst({
    where: { eventId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  return db.eventImage.create({
    data: {
      eventId,
      storageKey,
      mimeType: clean.mimeType,
      width: clean.width,
      height: clean.height,
      bytes: clean.data.length,
      position: (last?.position ?? -1) + 1,
    },
  });
}

export async function removeEventImage(eventId: string, imageId: string) {
  const img = await db.eventImage.findFirst({ where: { id: imageId, eventId } });
  if (!img) throw new ApiError(404, 'NOT_FOUND', 'Picture not found');
  await db.eventImage.delete({ where: { id: img.id } });
  await objectStore()
    .delete(img.storageKey)
    .catch(() => undefined);
}

/** Copies an event's pictures to another event (Duplicate / Repeat yearly). */
export async function copyEventImages(fromId: string, toId: string) {
  const imgs = await db.eventImage.findMany({
    where: { eventId: fromId },
    orderBy: { position: 'asc' },
  });
  for (const img of imgs) {
    const body = await objectStore().get(img.storageKey);
    if (!body) continue;
    const storageKey = `events/${randomBytes(24).toString('hex')}.${img.mimeType === 'image/gif' ? 'gif' : 'jpg'}`;
    await objectStore().put(storageKey, body, img.mimeType);
    await db.eventImage.create({
      data: {
        eventId: toId,
        storageKey,
        mimeType: img.mimeType,
        width: img.width,
        height: img.height,
        bytes: img.bytes,
        position: img.position,
      },
    });
  }
}
