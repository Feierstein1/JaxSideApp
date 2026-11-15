import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { localDate } from '@jax/shared';
import { POST as decisionPOST } from '@/app/api/v1/admin/place-requests/[id]/route';
import { POST as adminCreatePOST } from '@/app/api/v1/admin/events/route';
import { POST as adsPOST } from '@/app/api/v1/ads/route';
import { POST as areasPOST } from '@/app/api/v1/events/areas/route';
import { POST as featuredPOST } from '@/app/api/v1/events/featured/route';
import { POST as listPOST } from '@/app/api/v1/events/list/route';
import { PUT as followPUT } from '@/app/api/v1/events/[id]/follow/route';
import { resetAdCache } from '@/server/ads/serve';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { setMailer } from '@/server/mail/mailer';
import { ensureTiers } from '@/server/plan-tiers';
import { endFinishedEventAds, redeemPromo, rollPlans, startBoost } from '@/server/plans/lifecycle';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { captureMailer } from './http-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D248: launch tiers, the Standard trial then Free forever, promo codes, boosts, and Free
// reaching about a mile.

const DAY = 86_400_000;
const CAFE = { latitude: 30.3276, longitude: -81.659 }; // downtown
const NEAR_CAFE = { latitude: 30.329, longitude: -81.6585 }; // ~160 m away
const JAX_BEACH = { latitude: 30.2866, longitude: -81.3934 }; // ~25 km away, still in Duval
const reading = (at: { latitude: number; longitude: number }) => ({
  ...at,
  accuracyMeters: 10,
  timestamp: Date.now() - 2_000,
});
const inDays = (n: number) => localDate(new Date(Date.now() + n * DAY));

let admin: Record<string, string>;
let cafe: string;
let owner: string;
let reader: string;
let mail: ReturnType<typeof captureMailer>;

const plan = (code: string) => db.plan.findUniqueOrThrow({ where: { code } });
async function onPlan(accountId: string, code: 'FREE' | 'STANDARD' | 'PREMIUM') {
  await db.subscription.create({
    data: {
      accountId,
      planId: (await plan(code)).id,
      source: code === 'FREE' ? 'FREE_PLAN' : 'COMP',
      startsAt: new Date(Date.now() - DAY),
    },
  });
}
async function account(email: string, kind: 'BUSINESS' | 'ORGANIZER' = 'BUSINESS') {
  return (await db.businessAccount.create({ data: { email, passwordHash: 'x', kind } })).id;
}
/** An approved event from `accountId` at the café's pin. */
async function hostedEvent(accountId: string, title = 'Jazz night') {
  const r = await call(adminCreatePOST as H, 'POST', {
    headers: admin,
    body: {
      title,
      description: 'A trio plays standards.',
      category: 'music',
      setting: 'indoor',
      free: true,
      hostKind: 'organizer',
      ...CAFE,
      sessions: [{ date: inDays(3), start: '19:00', end: '22:00' }],
    },
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  await db.event.update({ where: { id: r.body.id }, data: { businessAccountId: accountId } });
  return r.body.id as string;
}
const titlesAt = async (at: typeof CAFE, filters: Record<string, unknown> = {}) =>
  (
    await call(listPOST as H, 'POST', {
      token: reader,
      body: { reading: reading(at), ...filters },
    })
  ).body.items.map((e: { title: string }) => e.title);

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
  invalidateConfigCache();
  resetAdCache();
  await ensureTiers(db);
  await importOsmPlaces(db, [
    {
      type: 'node',
      id: 1,
      lat: CAFE.latitude,
      lon: CAFE.longitude,
      tags: { amenity: 'cafe', name: 'Bold Bean' },
    },
  ]);
  cafe = (await db.businessPlace.findFirstOrThrow()).id;
  owner = await account('owner@x.test');
  admin = await adminHeaders((await createTestUser('boss_p', { role: 'ADMIN' })).id);
  const u = await createTestUser('reader_p', {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - 10 * DAY),
  });
  reader = (await createSession(u.id, 'MOBILE')).token;
  mail = captureMailer();
  setMailer(mail.mailer);
}, 60_000);
afterEach(() => setMailer(undefined));

describe('the launch tiers (D248)', () => {
  it('Free is forever, with 5 events a month and a mile of reach; boosts by plan', async () => {
    const free = await db.plan.findUniqueOrThrow({
      where: { code: 'FREE' },
      include: { entitlements: true },
    });
    expect(free.durationDays).toBeNull();
    const e = Object.fromEntries(free.entitlements.map((x) => [x.key, x.value]));
    expect(e).toMatchObject({
      'events.limit': 5,
      'ads.library': 20,
      'ads.reach': 'NEAR',
      'events.reach': 'NEAR',
      'boosts.perMonth': 0,
    });
  });
});

describe('the trial, then Free (D248)', () => {
  it('a new business gets Standard for 30 days, a warning 3 days before, then Free', async () => {
    const r = await db.businessVerificationRequest.create({
      data: { accountId: owner, placeName: 'Bold Bean', contactName: 'Ann', placeId: cafe },
    });
    await call(decisionPOST as H, 'POST', {
      headers: admin,
      params: { id: r.id },
      body: { decision: 'approve' },
    });
    const trial = await db.subscription.findFirstOrThrow({ include: { plan: true } });
    expect(trial).toMatchObject({ status: 'TRIALING', source: 'FREE_TIER' });
    expect(trial.plan.code).toBe('STANDARD');
    const ends = trial.endsAt!.getTime();
    expect(Math.round((ends - Date.now()) / DAY)).toBe(30);

    // Three days before: one notice and one email (running twice sends nothing more).
    const soon = new Date(ends - 2.5 * DAY);
    await rollPlans(soon);
    await rollPlans(soon);
    expect(await db.businessNotice.count({ where: { kind: 'TRIAL_ENDING' } })).toBe(1);
    expect(mail.sent.map((m) => m.to)).toEqual(['owner@x.test']);

    // The day it ends: expired, on Free with no end, and the one-time notice.
    const after = new Date(ends + 60_000);
    expect((await rollPlans(after)).movedToFree).toBe(1);
    const subs = await db.subscription.findMany({
      orderBy: { createdAt: 'asc' },
      include: { plan: true },
    });
    expect(subs.map((s) => [s.plan.code, s.status, s.endsAt])).toEqual([
      ['STANDARD', 'EXPIRED', trial.endsAt],
      ['FREE', 'ACTIVE', null],
    ]);
    expect(await db.businessNotice.count({ where: { kind: 'PLAN_DOWNGRADED' } })).toBe(1);
  });
});

describe('promo codes (D248)', () => {
  const makeCode = async (over: Record<string, unknown> = {}) =>
    db.promoCode.create({
      data: {
        code: 'JAXLAUNCH',
        planId: (await plan('STANDARD')).id,
        days: 60,
        maxUses: 50,
        ...over,
      },
    });

  it('adds its days to the Standard trial, once per account', async () => {
    await makeCode();
    await db.subscription.create({
      data: {
        accountId: owner,
        planId: (await plan('STANDARD')).id,
        source: 'FREE_TIER',
        status: 'TRIALING',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 30 * DAY),
      },
    });
    const s = await redeemPromo(owner, 'jaxlaunch');
    expect(Math.round((s.endsAt!.getTime() - Date.now()) / DAY)).toBe(90);
    expect((await db.promoCode.findFirstOrThrow()).uses).toBe(1);
    await expect(redeemPromo(owner, 'JAXLAUNCH')).rejects.toMatchObject({
      code: 'ALREADY_USED_A_CODE',
    });
  });

  // 🔒 The cap holds, codes end, and organizers can't use them.
  it('refuses past its cap, after it expires, when off, and for organizers', async () => {
    await makeCode({ maxUses: 1 });
    await onPlan(owner, 'FREE');
    expect((await redeemPromo(owner, 'JAXLAUNCH')).plan.code).toBe('STANDARD');
    const second = await account('second@x.test');
    await expect(redeemPromo(second, 'JAXLAUNCH')).rejects.toMatchObject({
      code: 'CODE_NOT_VALID',
    });
    await makeCode({ code: 'OLDCODE', expiresAt: new Date(Date.now() - DAY) });
    await expect(redeemPromo(second, 'OLDCODE')).rejects.toMatchObject({ code: 'CODE_NOT_VALID' });
    await makeCode({ code: 'OFFCODE', active: false });
    await expect(redeemPromo(second, 'OFFCODE')).rejects.toMatchObject({ code: 'CODE_NOT_VALID' });
    const org = await account('fest@x.test', 'ORGANIZER');
    await makeCode({ code: 'ORGCODE' });
    await expect(redeemPromo(org, 'ORGCODE')).rejects.toMatchObject({ code: 'BUSINESS_ONLY' });
    await expect(
      db.promoCode.update({ where: { code: 'JAXLAUNCH' }, data: { uses: 2 } }),
    ).rejects.toThrow(); // the database never lets uses pass the cap
  });
});

describe('Free reaches about a mile; boosts reach everyone (D248)', () => {
  it('a Free host’s event shows near it, not across town, unless boosted or followed', async () => {
    await onPlan(owner, 'FREE');
    const id = await hostedEvent(owner);
    expect(await titlesAt(NEAR_CAFE)).toEqual(['Jazz night']);
    expect(await titlesAt(JAX_BEACH)).toEqual([]);
    // A follower still sees it (they found it nearby).
    await call(followPUT as H, 'PUT', { token: reader, id });
    expect(await titlesAt(JAX_BEACH)).toEqual(['Jazz night']);
  });

  it('searching, or picking its neighborhood or ZIP, finds a Free event from anywhere', async () => {
    await onPlan(owner, 'FREE');
    const id = await hostedEvent(owner);
    const e = await db.event.findUniqueOrThrow({ where: { id } });
    expect(await titlesAt(JAX_BEACH, { q: 'jazz' })).toEqual(['Jazz night']);
    expect(await titlesAt(JAX_BEACH, { neighborhood: e.neighborhood })).toEqual(['Jazz night']);
    const areas = await call(areasPOST as H, 'POST', {
      token: reader,
      body: { reading: reading(JAX_BEACH) },
    });
    expect(areas.body.neighborhoods).toContain(e.neighborhood);
  });

  it('a paid host’s event shows everywhere', async () => {
    await onPlan(owner, 'STANDARD');
    await hostedEvent(owner);
    expect(await titlesAt(JAX_BEACH)).toEqual(['Jazz night']);
  });

  it('a boosted event is Featured and seen everywhere', async () => {
    await onPlan(owner, 'STANDARD');
    const id = await hostedEvent(owner);
    await startBoost(owner, { eventId: id, days: 7 });
    const r = await call(featuredPOST as H, 'POST', {
      token: reader,
      body: { reading: reading(JAX_BEACH) },
    });
    expect(r.body.events.map((e: { id: string; featured: boolean }) => [e.id, e.featured])).toEqual(
      [[id, true]],
    );
  });

  it('a Free business’s ad reaches about a mile; a boosted one reaches everyone', async () => {
    await onPlan(owner, 'STANDARD');
    await db.businessPlaceAccess.create({
      data: { accountId: owner, placeId: cafe, role: 'OWNER' },
    });
    const ad = await db.ad.create({
      data: {
        accountId: owner,
        placeId: cafe,
        template: 'BANNER',
        headline: 'Half-price lattes',
        status: 'APPROVED',
        cityWide: true,
        approvedAt: new Date(),
      },
    });
    await db.subscription.updateMany({ data: { status: 'CANCELLED' } });
    await onPlan(owner, 'FREE');
    const seen = async (at: typeof CAFE) => {
      resetAdCache();
      return (
        await call(adsPOST as H, 'POST', {
          token: reader,
          body: { reading: reading(at), context: { kind: 'feed' }, count: 3 },
        })
      ).body.ads.length;
    };
    expect(await seen(NEAR_CAFE)).toBe(1);
    expect(await seen(JAX_BEACH)).toBe(0);
    // Free has no boosts; on Standard the boost reaches across town.
    await expect(startBoost(owner, { adId: ad.id, days: 3 })).rejects.toMatchObject({
      code: 'NO_BOOSTS_LEFT',
    });
    await db.subscription.updateMany({ data: { status: 'CANCELLED' } });
    await onPlan(owner, 'STANDARD');
    await startBoost(owner, { adId: ad.id, days: 3 });
    expect(await seen(JAX_BEACH)).toBe(1);
  });

  // 🔒 The monthly allowance holds (Standard: one a month), one live boost per ad or event.
  it('refuses a second boost in the month on Standard, and boosting the same thing twice', async () => {
    await onPlan(owner, 'STANDARD');
    const a = await hostedEvent(owner, 'Jazz night');
    const b = await hostedEvent(owner, 'Open mic');
    await startBoost(owner, { eventId: a, days: 3 });
    await expect(startBoost(owner, { eventId: b, days: 3 })).rejects.toMatchObject({
      code: 'NO_BOOSTS_LEFT',
    });
    await db.subscription.updateMany({ data: { status: 'CANCELLED' } });
    await onPlan(owner, 'PREMIUM');
    await expect(startBoost(owner, { eventId: a, days: 3 })).rejects.toMatchObject({
      code: 'ALREADY_BOOSTED',
    });
    await expect(
      db.boost.create({
        data: { accountId: owner, eventId: b, days: 5, startsAt: new Date(), endsAt: new Date() },
      }),
    ).rejects.toThrow(); // the database: 3, 7 or 14 days, ending when they're up
    // The database also holds the allowance for writers that skip the rule (the website).
    const now = new Date();
    const boost = (eventId: string) =>
      db.boost.create({
        data: {
          accountId: owner,
          eventId,
          days: 3,
          startsAt: now,
          endsAt: new Date(now.getTime() + 3 * DAY),
        },
      });
    await boost(b); // Premium: the second this month
    const c = await hostedEvent(owner, 'Poetry slam');
    await expect(boost(c)).rejects.toThrow(); // a third is too many
    await expect(boost(b)).rejects.toThrow(); // and b is already boosted
  });
});

describe('event ads end with their event (D248)', () => {
  it('ends an event ad once its event is over, and ends finished boosts', async () => {
    await onPlan(owner, 'STANDARD');
    const id = await hostedEvent(owner);
    const ad = await db.ad.create({
      data: {
        accountId: owner,
        eventId: id,
        template: 'BANNER',
        headline: 'Jazz tonight',
        status: 'APPROVED',
        cityWide: true,
        approvedAt: new Date(),
      },
    });
    await startBoost(owner, { adId: ad.id, days: 3 });
    expect((await endFinishedEventAds()).eventAdsEnded).toBe(0);
    const later = new Date(Date.now() + 15 * DAY);
    expect(await endFinishedEventAds(later)).toMatchObject({ eventAdsEnded: 1, boostsEnded: 1 });
    expect((await db.ad.findUniqueOrThrow({ where: { id: ad.id } })).status).toBe('ENDED');
  });
});
