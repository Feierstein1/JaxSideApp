import { beforeEach, describe, expect, it } from 'vitest';
import { localDate } from '@jax/shared';
import { POST as adminDecidePOST } from '@/app/api/v1/admin/events/[id]/decide/route';
import { POST as adminCreatePOST } from '@/app/api/v1/admin/events/route';
import { POST as namePOST } from '@/app/api/v1/admin/organizer-names/[id]/route';
import { POST as placeChangePOST } from '@/app/api/v1/admin/place-changes/[id]/route';
import { POST as detailPOST } from '@/app/api/v1/events/[id]/route';
import { reviewQueue } from '@/server/admin/review-queue';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { likelyDuplicates } from '@/server/events/admin';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D242 (D238): one review queue, "Already on the calendar", flyers, and change requests.

const DAY = 86_400_000;
const DOWNTOWN = { latitude: 30.3274, longitude: -81.6588 };
const reading = () => ({ ...DOWNTOWN, accuracyMeters: 10, timestamp: Date.now() - 2_000 });
const inDays = (n: number) => localDate(new Date(Date.now() + n * DAY));
const CAFE_NODE = {
  type: 'node' as const,
  id: 1,
  lat: 30.3276,
  lon: -81.659,
  tags: { amenity: 'cafe', name: 'Bold Bean' },
};

let admin: Record<string, string>;
let cafe: string;
let owner: string;
let organizer: string;

const ago = (ms: number) => new Date(Date.now() - ms);
const event = (over: Record<string, unknown> = {}) =>
  call(adminCreatePOST as H, 'POST', {
    headers: admin,
    body: {
      title: 'Trivia night',
      description: 'Teams of four, prizes.',
      category: 'community',
      setting: 'indoor',
      free: true,
      ...DOWNTOWN,
      sessions: [{ date: inDays(4), start: '19:00', end: '21:00' }],
      ...over,
    },
  }).then((r) => {
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body.id as string;
  });
/** An event the website sent (in review), from `accountId`, sent `sentAgo` ms ago. */
async function sent(accountId: string, sentAgo = 0, over: Record<string, unknown> = {}) {
  const id = await event(over);
  await db.event.update({
    where: { id },
    data: { status: 'IN_REVIEW', businessAccountId: accountId, submittedAt: ago(sentAgo) },
  });
  return id;
}
const decide = (id: string, body: Record<string, unknown>) =>
  call(adminDecidePOST as H, 'POST', { headers: admin, id, body });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
  invalidateConfigCache();
  await importOsmPlaces(db, [CAFE_NODE]);
  cafe = (await db.businessPlace.findFirstOrThrow()).id;
  owner = (await db.businessAccount.create({ data: { email: 'o@x.test', passwordHash: 'x' } })).id;
  organizer = (
    await db.businessAccount.create({ data: { email: 'fest@x.test', passwordHash: 'x' } })
  ).id;
  await db.businessPlaceAccess.create({ data: { accountId: owner, placeId: cafe, role: 'OWNER' } });
  admin = await adminHeaders((await createTestUser('boss_r', { role: 'ADMIN' })).id);
}, 60_000);

describe('the review queue (D242)', () => {
  it('lists everything waiting, oldest sent first, with counts per kind', async () => {
    await db.businessVerificationRequest.create({
      data: {
        accountId: owner,
        placeName: 'Bold Bean',
        contactName: 'Ann',
        placeId: cafe,
        createdAt: ago(3 * DAY),
      },
    });
    const ev = await sent(organizer, 1 * DAY);
    await db.eventOrganizer.create({
      data: {
        accountId: organizer,
        name: 'Jax Trivia',
        contactName: 'Pat',
        createdAt: ago(2 * DAY),
      },
    });
    await db.placeChangeRequest.create({
      data: { placeId: cafe, accountId: owner, name: 'Bold Bean Coffee' },
    });
    const q = await reviewQueue();
    expect(q.rows.map((r) => r.kind)).toEqual(['place', 'organizer', 'event', 'placeChange']);
    expect(q.rows[2]).toMatchObject({ id: ev, href: `/admin/events/${ev}` });
    expect(q.counts).toMatchObject({ place: 1, event: 1, organizer: 1, placeChange: 1, ad: 0 });
    expect((await reviewQueue({ kind: 'event' })).rows.map((r) => r.id)).toEqual([ev]);
    // Decided things leave it.
    await decide(ev, { action: 'approve' });
    expect((await reviewQueue()).counts.event).toBe(0);
  });
});

describe('"Already on the calendar" (D242)', () => {
  it('marks a copy, tells the sender, no strike, and the app never shows it', async () => {
    const original = await event();
    const copy = await sent(organizer);
    expect((await likelyDuplicates(copy)).map((c) => c.id)).toEqual([original]);
    expect((await decide(copy, { action: 'duplicate', duplicateOfId: original })).status).toBe(200);
    expect(await db.event.findUniqueOrThrow({ where: { id: copy } })).toMatchObject({
      status: 'DUPLICATE',
      duplicateOfId: original,
    });
    expect(
      await db.businessNotice.findFirstOrThrow({ where: { accountId: organizer } }),
    ).toMatchObject({ kind: 'EVENT_DUPLICATE', link: `/events/${copy}` });
    expect(await db.moderationAction.count()).toBe(0);
    const u = await createTestUser('reader_r', { emailVerifiedAt: new Date() });
    const token = (await createSession(u.id, 'MOBILE')).token;
    const r = await call(detailPOST as H, 'POST', {
      token,
      id: copy,
      body: { reading: reading() },
    });
    expect(r.status).toBe(404);
  });

  // 🔒 It must point at an event on the calendar, never at itself or one in review.
  it('refuses itself, an event in review, and a decided event', async () => {
    const copy = await sent(organizer);
    const other = await sent(owner);
    expect((await decide(copy, { action: 'duplicate', duplicateOfId: copy })).status).toBe(409);
    expect((await decide(copy, { action: 'duplicate', duplicateOfId: other })).status).toBe(409);
    const original = await event();
    await decide(copy, { action: 'duplicate', duplicateOfId: original });
    expect((await decide(copy, { action: 'duplicate', duplicateOfId: original })).status).toBe(409);
    await expect(
      db.event.update({ where: { id: other }, data: { duplicateOfId: original } }),
    ).rejects.toThrow(); // database: only a DUPLICATE names an original
  });
});

describe('flyers (D242)', () => {
  const picture = (eventId: string, kind: 'FLYER' | 'PHOTO', n: number) =>
    db.eventImage.create({
      data: {
        eventId,
        kind,
        storageKey: `events/test-${kind}-${n}-${eventId}.jpg`,
        mimeType: 'image/jpeg',
        width: 800,
        height: 1200,
        bytes: 1000,
        position: n,
      },
    });

  it('the app gets flyers first, then photos; the card uses a photo', async () => {
    const id = await event();
    await picture(id, 'PHOTO', 0);
    await picture(id, 'FLYER', 0);
    const u = await createTestUser('reader_f', { emailVerifiedAt: new Date() });
    const token = (await createSession(u.id, 'MOBILE')).token;
    const e = (await call(detailPOST as H, 'POST', { token, id, body: { reading: reading() } }))
      .body.event;
    expect(e.images.map((i: { kind: string }) => i.kind)).toEqual(['flyer', 'photo']);
    expect(e.imageUrl).toContain(e.images[1].id);
  });

  // 🔒 At most 2 flyers and 6 photos, whoever uploads them (the database checks too).
  it('the database refuses a third flyer and a seventh photo', async () => {
    const id = await event();
    await picture(id, 'FLYER', 0);
    await picture(id, 'FLYER', 1);
    await expect(picture(id, 'FLYER', 2)).rejects.toThrow();
    for (let n = 0; n < 6; n++) await picture(id, 'PHOTO', n);
    await expect(picture(id, 'PHOTO', 6)).rejects.toThrow();
  });
});

describe('place and organizer changes (D242)', () => {
  const placeChange = (data: Record<string, unknown>) =>
    db.placeChangeRequest.create({
      data: { placeId: cafe, accountId: owner, ...data } as never,
    });
  const decidePlace = (id: string, body: Record<string, unknown>, headers = admin) =>
    call(placeChangePOST as H, 'POST', { headers, id, body });

  it('approving changes the place for everyone, and the next map import keeps it', async () => {
    const r = await placeChange({
      name: 'Bold Bean Coffee',
      category: 'restaurant',
      latitude: 30.328,
      longitude: -81.6592,
      note: 'We renamed last month',
    });
    expect((await decidePlace(r.id, { decision: 'approve' })).status).toBe(200);
    const p = await db.businessPlace.findUniqueOrThrow({ where: { id: cafe } });
    expect(p).toMatchObject({ name: 'Bold Bean Coffee', category: 'restaurant', latitude: 30.328 });
    expect(p.detailsSetAt).not.toBeNull();
    expect(await db.businessNotice.findFirstOrThrow()).toMatchObject({
      kind: 'PLACE_CHANGE_APPROVED',
      accountId: owner,
    });
    await importOsmPlaces(db, [CAFE_NODE]); // the map still says "Bold Bean"
    expect((await db.businessPlace.findUniqueOrThrow({ where: { id: cafe } })).name).toBe(
      'Bold Bean Coffee',
    );
  });

  // 🔒 A reason to turn down; only the Owner's request; pins in Duval; admins only; one open.
  it('refuses no reason, a non-owner, a pin outside Duval, non-admins and a second request', async () => {
    const r = await placeChange({ name: 'Bold Bean Coffee' });
    expect((await decidePlace(r.id, { decision: 'reject' })).status).toBe(400);
    await expect(placeChange({ name: 'Another name' })).rejects.toThrow(); // one open per place
    const u = await createTestUser('not_admin_c');
    const token = (await createSession(u.id, 'MOBILE')).token;
    const asUser = await call(placeChangePOST as H, 'POST', {
      token,
      id: r.id,
      body: { decision: 'approve' },
    });
    expect([401, 403]).toContain(asUser.status);
    await db.businessPlaceAccess.updateMany({ data: { revokedAt: new Date() } });
    expect((await decidePlace(r.id, { decision: 'approve' })).body.error.code).toBe('NOT_OWNER');
    await db.businessPlaceAccess.create({
      data: { accountId: owner, placeId: cafe, role: 'OWNER' },
    });
    await db.placeChangeRequest.update({
      where: { id: r.id },
      data: { latitude: 28.54, longitude: -81.38 },
    });
    expect((await decidePlace(r.id, { decision: 'approve' })).body.error.code).toBe(
      'OUTSIDE_SERVICE_AREA',
    );
    expect((await db.businessPlace.findUniqueOrThrow({ where: { id: cafe } })).name).toBe(
      'Bold Bean',
    );
    expect(
      (await decidePlace(r.id, { decision: 'reject', note: 'Send proof of the new name' })).status,
    ).toBe(200);
    expect(await db.businessNotice.findFirstOrThrow()).toMatchObject({
      kind: 'PLACE_CHANGE_REJECTED',
      body: 'Send proof of the new name',
    });
  });

  it('an approved organizer name shows on its events', async () => {
    await db.eventOrganizer.create({
      data: { accountId: organizer, name: 'Jax Trivia', contactName: 'Pat' },
    });
    const r = await db.organizerNameRequest.create({
      data: { accountId: organizer, currentName: 'Jax Trivia', name: 'Jax Trivia League' },
    });
    expect(
      (
        await call(namePOST as H, 'POST', {
          headers: admin,
          id: r.id,
          body: { decision: 'approve' },
        })
      ).status,
    ).toBe(200);
    expect(
      (await db.eventOrganizer.findUniqueOrThrow({ where: { accountId: organizer } })).name,
    ).toBe('Jax Trivia League');
    expect(await db.businessNotice.findFirstOrThrow()).toMatchObject({
      kind: 'ORGANIZER_NAME_APPROVED',
    });
  });
});
