import { beforeEach, describe, expect, it } from 'vitest';
import { POST as feedPOST } from '@/app/api/v1/feed/route';
import { createSession } from '@/server/auth/sessions';
import { cellBounds, cellCenter, cellKeyOf } from '@/server/chat/cells';
import {
  chatIsOpen,
  countPresent,
  notePresence,
  PRESENCE_KEEP_MS,
  PRESENT_WITHIN_MS,
  purgeOldPresence,
} from '@/server/chat/presence';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { importZipAreas } from '@/server/stats/zip-areas';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D218 / P17.2: chat rooms per map cell, and who has the app open in each.

const FIVE_POINTS = { latitude: 30.3149, longitude: -81.6853 }; // ZIP 32204
const reading = (p = FIVE_POINTS) => ({ ...p, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let alice: { id: string; token: string };
let bob: { id: string; token: string };
let cara: { id: string; token: string };

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  invalidateConfigCache();
  await importServiceArea(db, readBoundaryFile());
  await importZipAreas(db);
  for (const [name, set] of [
    ['alice_c', (u: typeof alice) => (alice = u)],
    ['bob_c', (u: typeof alice) => (bob = u)],
  ] as const) {
    const u = await createTestUser(name, { emailVerifiedAt: new Date() });
    set({ id: u.id, token: (await createSession(u.id, 'MOBILE')).token });
  }
  const u = await createTestUser('cara_c'); // email not confirmed
  cara = { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
});

const feed = (token: string, at = FIVE_POINTS) =>
  call(feedPOST as H, 'POST', { token, body: { reading: reading(at) } });

describe('chat rooms and presence (D218)', () => {
  it('the first verified person in a cell creates its room, switched off, with ZIP and a name', async () => {
    expect(await db.chatRoom.count()).toBe(0);
    expect((await feed(alice.token)).status).toBe(200);
    const rooms = await db.chatRoom.findMany();
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.cellKey).toBe(cellKeyOf(FIVE_POINTS));
    expect(rooms[0]!.enabled).toBe(false);
    expect(rooms[0]!.zip).toBe('32204');
    expect(rooms[0]!.neighborhood).toBeTruthy();
  });

  it('a second person in the same cell shares the room (no second room)', async () => {
    await feed(alice.token);
    await feed(bob.token);
    expect(await db.chatRoom.count()).toBe(1);
    expect(await db.chatPresence.count()).toBe(2);
  });

  it('a different cell gets its own room', async () => {
    await feed(alice.token);
    await feed(bob.token, {
      latitude: FIVE_POINTS.latitude + 0.03,
      longitude: FIVE_POINTS.longitude,
    });
    expect(await db.chatRoom.count()).toBe(2);
  });

  it('only confirmed-email accounts are counted; the feed still works for others', async () => {
    expect((await feed(cara.token)).status).toBe(200);
    expect(await db.chatPresence.count()).toBe(0);
    expect(await db.chatRoom.count()).toBe(0);
  });

  it('presence holds a room and a time only: no coordinates, one row per person', async () => {
    await feed(alice.token);
    await feed(alice.token);
    const rows = await db.chatPresence.findMany();
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(['lastSeenAt', 'roomId', 'userId']);
  });

  it('counts people seen in the last 10 minutes; chat opens at 2 only if an admin switched it on', async () => {
    const t0 = new Date();
    const room = await notePresence(alice.id, FIVE_POINTS, t0);
    expect(await countPresent(room.id, t0)).toBe(1);
    await notePresence(bob.id, FIVE_POINTS, t0);
    expect(await countPresent(room.id, t0)).toBe(2);
    expect(await chatIsOpen(room, t0)).toBe(false); // switched off
    await db.chatRoom.update({ where: { id: room.id }, data: { enabled: true } });
    const on = await db.chatRoom.findUniqueOrThrow({ where: { id: room.id } });
    expect(await chatIsOpen(on, t0)).toBe(true);
    const later = new Date(t0.getTime() + PRESENT_WITHIN_MS + 1_000);
    expect(await countPresent(room.id, later)).toBe(0);
    expect(await chatIsOpen(on, later)).toBe(false);
  });

  it('stays in the old room until clearly inside the next cell (border margin)', async () => {
    const home = cellKeyOf(FIVE_POINTS);
    const first = await notePresence(alice.id, FIVE_POINTS);
    expect(first.cellKey).toBe(home);
    const b = cellBounds(home);
    const lat = cellCenter(home).latitude;
    const metersToLng = (m: number) => m / (111_320 * Math.cos((lat * Math.PI) / 180));
    const near = { latitude: lat, longitude: b.east + metersToLng(60) };
    expect((await notePresence(alice.id, near)).cellKey).toBe(home);
    const far = { latitude: lat, longitude: b.east + metersToLng(400) };
    expect((await notePresence(alice.id, far)).cellKey).toBe(cellKeyOf(far));
    expect(await db.chatRoom.count()).toBe(2);
    expect(await db.chatPresence.count()).toBe(1);
  });

  it('sightings older than 60 minutes are deleted', async () => {
    const t0 = new Date();
    await notePresence(alice.id, FIVE_POINTS, t0);
    await notePresence(bob.id, FIVE_POINTS, new Date(t0.getTime() - PRESENCE_KEEP_MS - 1_000));
    expect(await purgeOldPresence(t0)).toBe(1);
    expect(await db.chatPresence.count()).toBe(1);
  });

  it('deleting an account removes its sighting', async () => {
    await notePresence(alice.id, FIVE_POINTS);
    await db.user.delete({ where: { id: alice.id } });
    expect(await db.chatPresence.count()).toBe(0);
  });
});
