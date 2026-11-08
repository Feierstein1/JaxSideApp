import { getConfig } from '../config';
import { db } from '../db';
import type { GeoPoint } from '../location/eligibility';
import { metersBetween, nearestNeighborhood } from '../location/neighborhood';
import { cellCenter, chooseCell, compassFrom } from './cells';

/**
 * D218: who has the app open in which chat room. One row per person (their newest sighting),
 * no coordinates, no history. Written from the same place the area feed is opened; read for
 * "2 or more people here in the last 10 minutes" (turns a room on) and to remember which room
 * a person is in, so the border margin works. Rows older than 60 minutes are deleted.
 */
export const PRESENT_WITHIN_MS = 10 * 60_000;
export const PRESENCE_KEEP_MS = 60 * 60_000;
/** Chat turns on in a room (that an admin has switched on) once this many people are present. */
export const MIN_PEOPLE_TO_OPEN = 2;
/** A ZIP's name gets a direction only when the cell is this far from the ZIP's middle. */
const DIRECTION_FROM_METERS = 1_200;

/** ZIP, neighbourhood and direction for a new room, from the cell's middle. */
async function labelFor(cellKey: string) {
  const c = cellCenter(cellKey);
  const [row] = await db.$queryRaw<{ zip: string; clat: number; clon: number }[]>`
    SELECT zip,
           ST_Y(ST_Centroid(geom::geometry)) AS clat,
           ST_X(ST_Centroid(geom::geometry)) AS clon
    FROM "ZipArea"
    WHERE ST_Intersects(geom, ST_SetSRID(ST_MakePoint(${c.longitude}, ${c.latitude}), 4326)::geography)
    LIMIT 1`;
  const direction =
    row &&
    metersBetween({ lat: row.clat, lon: row.clon }, { lat: c.latitude, lon: c.longitude }) >
      DIRECTION_FROM_METERS
      ? compassFrom({ latitude: row.clat, longitude: row.clon }, c)
      : null;
  return { zip: row?.zip ?? null, neighborhood: nearestNeighborhood(c), direction };
}

/** The room for a cell; created (switched off) the first time anyone's location lands in it. */
async function roomFor(cellKey: string) {
  const found = await db.chatRoom.findUnique({ where: { cellKey } });
  if (found) return found;
  const label = await labelFor(cellKey);
  // Two people may arrive at once: the first insert wins and both read that one.
  await db.chatRoom.createMany({ data: [{ cellKey, ...label }], skipDuplicates: true });
  return db.chatRoom.findUniqueOrThrow({ where: { cellKey } });
}

/** Notes that a verified person has the app open at this (already eligibility-checked) point. */
export async function notePresence(userId: string, at: GeoPoint, now = new Date()) {
  const previous = await db.chatPresence.findUnique({
    where: { userId },
    select: { room: { select: { cellKey: true } } },
  });
  const cellKey = chooseCell(previous?.room.cellKey, at);
  const room = await roomFor(cellKey);
  await db.chatPresence.upsert({
    where: { userId },
    create: { userId, roomId: room.id, lastSeenAt: now },
    update: { roomId: room.id, lastSeenAt: now },
  });
  return room;
}

/** People seen in the room in the last 10 minutes. */
export function countPresent(roomId: string, now = new Date()) {
  return db.chatPresence.count({
    where: { roomId, lastSeenAt: { gte: new Date(now.getTime() - PRESENT_WITHIN_MS) } },
  });
}

/** Is the room's chat open right now: switched on by an admin and enough people about? */
export async function chatIsOpen(room: { id: string; enabled: boolean }, now = new Date()) {
  // TEMPORARY test switch (see constants.ts): open everywhere, whoever is about.
  if ((await getConfig('chat.testAlwaysOpen')) === 1) return true;
  return room.enabled && (await countPresent(room.id, now)) >= MIN_PEOPLE_TO_OPEN;
}

/** Deletes sightings older than 60 minutes (the maintenance job). */
export async function purgeOldPresence(now = new Date()) {
  const r = await db.chatPresence.deleteMany({
    where: { lastSeenAt: { lt: new Date(now.getTime() - PRESENCE_KEEP_MS) } },
  });
  return r.count;
}
