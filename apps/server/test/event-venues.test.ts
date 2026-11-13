import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FREE_TIER_DAYS, localDate } from '@jax/shared';
import { POST as adminDecidePOST } from '@/app/api/v1/admin/events/[id]/decide/route';
import { PATCH as adminEditPATCH } from '@/app/api/v1/admin/events/[id]/route';
import { POST as adminCreatePOST } from '@/app/api/v1/admin/events/route';
import { POST as adsPOST } from '@/app/api/v1/ads/route';
import { POST as detailPOST } from '@/app/api/v1/events/[id]/route';
import { POST as tapPOST } from '@/app/api/v1/events/[id]/tap/route';
import { POST as reportPOST } from '@/app/api/v1/reports/route';
import { resetAdCache } from '@/server/ads/serve';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { ensureTiers } from '@/server/plan-tiers';
import { importZipAreas } from '@/server/stats/zip-areas';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D236 (D232): events at another business's place (venue confirmation), a business's event
// held away from its place, links on events, team members per owner account, and Free event
// ads reaching the event's ZIP.

const DAY = 86_400_000;
const DOWNTOWN = { latitude: 30.3274, longitude: -81.6588 };
const RIVERSIDE = { latitude: 30.3108, longitude: -81.6905 };
const JAX_BEACH = { latitude: 30.2866, longitude: -81.3934 };
const reading = (at = DOWNTOWN) => ({ ...at, accuracyMeters: 10, timestamp: Date.now() - 2_000 });
const inDays = (n: number) => localDate(new Date(Date.now() + n * DAY));

let admin: Record<string, string>;
let me: { id: string; token: string };
let cafe: string; // Bold Bean, run by cafeOwner
let bar: string; // Riverside Tap, run by barOwner
let park: string; // no verified owner
let cafeOwner: string;
let barOwner: string;
let organizer: string;

const base = (over: Record<string, unknown> = {}) => ({
  title: 'Jazz night',
  description: 'A trio plays standards.',
  category: 'music',
  setting: 'indoor',
  free: true,
  sessions: [{ date: inDays(3), start: '19:00', end: '22:00' }],
  ...over,
});

/** An event the website sent for review (added here, then handed to a website account). */
async function sent(accountId: string, over: Record<string, unknown>) {
  const r = await call(adminCreatePOST as H, 'POST', { headers: admin, body: base(over) });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  const id = r.body.id as string;
  await db.event.update({
    where: { id },
    data: { status: 'IN_REVIEW', businessAccountId: accountId },
  });
  return id;
}
const approve = (id: string) =>
  call(adminDecidePOST as H, 'POST', { headers: admin, id, body: { action: 'approve' } });
const detail = (id: string, token = me.token) =>
  call(detailPOST as H, 'POST', { token, id, body: { reading: reading() } });

async function plan(accountId: string, code: 'FREE' | 'PREMIUM') {
  const p = await db.plan.findUniqueOrThrow({ where: { code } });
  const startsAt = new Date(Date.now() - DAY);
  await db.subscription.create({
    data:
      code === 'FREE'
        ? {
            accountId,
            planId: p.id,
            source: 'FREE_TIER',
            startsAt,
            endsAt: new Date(startsAt.getTime() + FREE_TIER_DAYS * DAY),
          }
        : { accountId, planId: p.id, startsAt },
  });
}

beforeAll(async () => {
  const keep = new Set(['_prisma_migrations', 'spatial_ref_sys']);
  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  await db.$executeRawUnsafe(
    `TRUNCATE ${rows
      .filter((r) => !keep.has(r.tablename))
      .map((r) => `"public"."${r.tablename}"`)
      .join(', ')} RESTART IDENTITY CASCADE`,
  );
  await importZipAreas(db);
}, 120_000);

beforeEach(async () => {
  // ZIP outlines are slow to import, so they're loaded once and kept between tests.
  const keep = new Set(['_prisma_migrations', 'spatial_ref_sys', 'ZipArea']);
  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  await db.$executeRawUnsafe(
    `TRUNCATE ${rows
      .filter((r) => !keep.has(r.tablename))
      .map((r) => `"public"."${r.tablename}"`)
      .join(', ')} RESTART IDENTITY CASCADE`,
  );
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
  invalidateConfigCache();
  resetAdCache();
  await ensureTiers(db);
  await importOsmPlaces(db, [
    {
      type: 'node',
      id: 1,
      lat: 30.3276,
      lon: -81.659,
      tags: { amenity: 'cafe', name: 'Bold Bean' },
    },
    {
      type: 'node',
      id: 2,
      lat: 30.311,
      lon: -81.6903,
      tags: { amenity: 'bar', name: 'Riverside Tap' },
    },
    { type: 'node', id: 3, lat: 30.32, lon: -81.67, tags: { leisure: 'park', name: 'Unity Park' } },
  ]);
  const byName = async (name: string) =>
    (await db.businessPlace.findFirstOrThrow({ where: { name } })).id;
  [cafe, bar, park] = await Promise.all([
    byName('Bold Bean'),
    byName('Riverside Tap'),
    byName('Unity Park'),
  ]);
  const account = async (email: string) =>
    (await db.businessAccount.create({ data: { email, passwordHash: 'x' } })).id;
  cafeOwner = await account('cafe@x.test');
  barOwner = await account('bar@x.test');
  organizer = await account('fest@x.test');
  await db.businessPlaceAccess.createMany({
    data: [
      { accountId: cafeOwner, placeId: cafe, role: 'OWNER' },
      { accountId: barOwner, placeId: bar, role: 'OWNER' },
    ],
  });
  const a = await createTestUser('boss_v', { role: 'ADMIN', emailVerifiedAt: new Date() });
  admin = await adminHeaders(a.id);
  const u = await createTestUser('reader_v', {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - 10 * DAY),
  });
  me = { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}, 60_000);

describe('an event at another business’s place (D236)', () => {
  it('approving asks the place’s owner; "Confirmed by" once they say yes', async () => {
    const id = await sent(organizer, { hostKind: 'organizer', placeId: bar });
    expect((await approve(id)).status).toBe(200);
    expect((await db.event.findUniqueOrThrow({ where: { id } })).venueStatus).toBe('ASKED');
    const notice = await db.businessNotice.findFirstOrThrow({
      where: { kind: 'EVENT_AT_YOUR_PLACE' },
    });
    expect(notice).toMatchObject({
      accountId: barOwner,
      placeId: bar,
      link: `/events/${id}/venue`,
    });
    // The event doesn't wait for the answer.
    const asked = await detail(id);
    expect(asked.body.event).toMatchObject({
      venue: 'Riverside Tap',
      venueConfirmedBy: null,
      hostedAt: null, // D240: not named as the host before it says yes
    });

    // The website records "Yes".
    await db.event.update({
      where: { id },
      data: { venueStatus: 'CONFIRMED', venueAnsweredAt: new Date() },
    });
    const confirmed = (await detail(id)).body.event;
    expect(confirmed.venueConfirmedBy).toBe('Riverside Tap');
    // D240: then it stands out as "Hosted at [place]", with what the app needs for its icon.
    expect(confirmed.hostedAt).toEqual({ placeId: bar, name: 'Riverside Tap', category: 'bar' });
  });

  it('while the owner says "Not at my place", the app doesn’t name the place', async () => {
    const id = await sent(organizer, { hostKind: 'organizer', placeId: bar });
    await approve(id);
    await db.event.update({
      where: { id },
      data: { venueStatus: 'DISPUTED', venueAnsweredAt: new Date() },
    });
    const e = (await detail(id)).body.event;
    expect(e.venue).not.toBe('Riverside Tap');
    expect(e.venueConfirmedBy).toBeNull();
  });

  // 🔒 Nobody is asked about their own place, a place without an owner, or JaxSide's events.
  it('asks nobody for the host’s own place, an ownerless place, or an admin’s event', async () => {
    const own = await sent(cafeOwner, { hostKind: 'business', placeId: cafe });
    const ownerless = await sent(organizer, { hostKind: 'organizer', placeId: park });
    for (const id of [own, ownerless]) {
      expect((await approve(id)).status).toBe(200);
      expect((await db.event.findUniqueOrThrow({ where: { id } })).venueStatus).toBe('NONE');
      expect((await detail(id)).body.event.hostedAt).toBeNull();
    }
    const r = await call(adminCreatePOST as H, 'POST', {
      headers: admin,
      body: base({ placeId: bar }),
    });
    expect((await db.event.findUniqueOrThrow({ where: { id: r.body.id } })).venueStatus).toBe(
      'NONE',
    );
    expect(await db.businessNotice.count({ where: { kind: 'EVENT_AT_YOUR_PLACE' } })).toBe(0);
  });

  it('a business can hold its event elsewhere: shown as hosted by its own place', async () => {
    const id = await sent(cafeOwner, { hostKind: 'business', hostPlaceId: cafe, placeId: bar });
    await approve(id);
    const e = (await detail(id)).body.event;
    expect(e.host).toMatchObject({ kind: 'business', name: 'Bold Bean', placeId: cafe });
    expect(e.venue).toBe('Riverside Tap');
    expect((await db.event.findUniqueOrThrow({ where: { id } })).venueStatus).toBe('ASKED');
    expect(e.hostedAt).toBeNull();
    // D240: once the other place confirms, it shows as "Hosted at" that place (the business
    // stays the host); an event at the host's own place never gets one.
    await db.event.update({
      where: { id },
      data: { venueStatus: 'CONFIRMED', venueAnsweredAt: new Date() },
    });
    expect((await detail(id)).body.event.hostedAt).toMatchObject({ placeId: bar });

    // …or at an address with its own pin.
    const away = await sent(cafeOwner, {
      hostKind: 'business',
      hostPlaceId: cafe,
      venueName: 'Memorial Park',
      ...RIVERSIDE,
    });
    await approve(away);
    expect((await detail(away)).body.event).toMatchObject({
      venue: 'Memorial Park',
      host: { name: 'Bold Bean' },
    });
  });

  it('moving the event to another place starts the question again', async () => {
    const id = await sent(organizer, { hostKind: 'organizer', placeId: bar });
    await approve(id);
    await db.event.update({
      where: { id },
      data: { venueStatus: 'DISPUTED', venueAnsweredAt: new Date() },
    });
    const r = await call(adminEditPATCH as H, 'PATCH', {
      headers: admin,
      id,
      body: base({ hostKind: 'organizer', placeId: park }),
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await db.event.findUniqueOrThrow({ where: { id } })).toMatchObject({
      venueStatus: 'NONE',
      venueAnsweredAt: null,
    });
  });

  // 🔒 "Not at my place" is the venue owner's report (website); the app can't send it.
  it('app users can’t use the venue owner’s report reason', async () => {
    const id = await sent(organizer, { hostKind: 'organizer', placeId: bar });
    await approve(id);
    const r = await call(reportPOST as H, 'POST', {
      token: me.token,
      body: { reading: reading(), target: { type: 'event', id }, reason: 'EVENT_NOT_AT_MY_PLACE' },
    });
    expect(r.status).toBe(400);
  });
});

describe('links on events (D236, D216 rules)', () => {
  const linked = (accountId: string) =>
    sent(accountId, {
      hostKind: 'business',
      placeId: cafe,
      linkUrl: 'https://tickets.example.com/jazz',
      linkLabel: 'Get tickets',
    });

  it('shows the button on a paid plan, not on Free', async () => {
    await plan(cafeOwner, 'PREMIUM');
    const id = await linked(cafeOwner);
    await approve(id);
    expect((await detail(id)).body.event.link).toEqual({
      url: 'https://tickets.example.com/jazz',
      label: 'Get tickets',
    });
    await db.subscription.updateMany({ data: { status: 'CANCELLED', cancelledAt: new Date() } });
    await plan(cafeOwner, 'FREE');
    expect((await detail(id)).body.event.link).toBeNull();
  });

  it('counts a tap once per person per day; 🔒 not for an event without a link', async () => {
    const id = await linked(cafeOwner);
    await approve(id);
    const tap = (eventId: string) =>
      call(tapPOST as H, 'POST', { token: me.token, id: eventId, body: {} });
    expect((await tap(id)).body.counted).toBe(true);
    expect((await tap(id)).body.counted).toBe(false);
    expect((await db.eventDailyStats.findFirstOrThrow({ where: { eventId: id } })).taps).toBe(1);
    const plain = await sent(organizer, { hostKind: 'organizer', ...DOWNTOWN });
    await approve(plain);
    expect((await tap(plain)).body.counted).toBe(false);
  });

  // 🔒 The same rules as ad links, in the schema and in the database.
  it('refuses a link without button text, a non-https link, and a host place off a business', async () => {
    const half = await call(adminCreatePOST as H, 'POST', {
      headers: admin,
      body: base({ ...DOWNTOWN, linkUrl: 'https://x.test' }),
    });
    expect(half.status).toBe(400);
    const notBusiness = await call(adminCreatePOST as H, 'POST', {
      headers: admin,
      body: base({ ...DOWNTOWN, hostPlaceId: cafe }),
    });
    expect(notBusiness.status).toBe(400);
    const id = await sent(organizer, { hostKind: 'organizer', ...DOWNTOWN });
    await expect(
      db.event.update({ where: { id }, data: { linkUrl: 'http://x.test', linkLabel: 'Tickets' } }),
    ).rejects.toThrow();
    await expect(db.event.update({ where: { id }, data: { hostPlaceId: cafe } })).rejects.toThrow();
  });
});

describe('Free event ads reach the event’s ZIP (D236)', () => {
  it('a Free organizer’s event ad shows only in the event’s ZIP, whatever the ad row says', async () => {
    await plan(organizer, 'FREE');
    const id = await sent(organizer, { hostKind: 'organizer', ...DOWNTOWN });
    await approve(id);
    await db.ad.create({
      data: {
        accountId: organizer,
        eventId: id,
        template: 'BANNER',
        headline: 'Jazz night downtown',
        status: 'APPROVED',
        cityWide: true,
        approvedAt: new Date(),
      },
    });
    resetAdCache();
    const ask = (at: typeof DOWNTOWN) =>
      call(adsPOST as H, 'POST', {
        token: me.token,
        body: { reading: reading(at), context: { kind: 'feed' }, count: 3 },
      });
    expect((await ask(DOWNTOWN)).body.ads).toHaveLength(1);
    expect((await ask(JAX_BEACH)).body.ads).toHaveLength(0);
  });
});

describe('team members on the owner account (D236)', () => {
  // 🔒 Managers and Staff only; one team per login; one live invite per email per team.
  it('the database keeps teams straight', async () => {
    const member = (
      await db.businessAccount.create({ data: { email: 'sam@x.test', passwordHash: 'x' } })
    ).id;
    const add = (data: Record<string, unknown>) =>
      db.businessTeamMember.create({
        data: { ownerAccountId: cafeOwner, email: 'sam@x.test', role: 'STAFF', ...data } as never,
      });
    await expect(add({ role: 'OWNER' })).rejects.toThrow();
    await expect(add({ email: 'Sam@X.test' })).rejects.toThrow();
    await expect(add({ acceptedAt: new Date() })).rejects.toThrow(); // accepted needs a login
    await add({ memberAccountId: member, acceptedAt: new Date() });
    await expect(add({ email: 'sam@x.test' })).rejects.toThrow(); // same email, same team
    await expect(
      db.businessTeamMember.create({
        data: {
          ownerAccountId: barOwner,
          memberAccountId: member,
          email: 'sam@x.test',
          role: 'MANAGER',
        },
      }),
    ).rejects.toThrow(); // a login is on one team
    await expect(
      db.businessTeamMember.create({
        data: {
          ownerAccountId: cafeOwner,
          memberAccountId: cafeOwner,
          email: 'c2@x.test',
          role: 'MANAGER',
        },
      }),
    ).rejects.toThrow(); // not your own team member
  });
});
