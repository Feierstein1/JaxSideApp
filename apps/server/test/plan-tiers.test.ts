import { beforeEach, describe, expect, it } from 'vitest';
import { FREE_TIER_DAYS, NO_PLAN_ENTITLEMENTS, planEntitlements } from '@jax/shared';
import { createPlan, endSubscription, entitlementsFor, updatePlan } from '@/server/admin/plans';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { runMaintenance } from '@/server/jobs/maintenance';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { ensureTiers } from '@/server/plan-tiers';
import { resetDb } from './db-helpers';
import { createTestUser } from './user-factory';

// D202: tiers (Free, Standard, Premium) with entitlement rows and prices, and subscriptions
// shaped for Stripe (not synced yet). One free month per business and per place.

const DAY = 86_400_000;
let owner: { id: string };
let cafe: string;
let adminId: string;

const tier = (code: string) => db.plan.findUniqueOrThrow({ where: { code } });
const freeMonth = (accountId: string, placeId: string | null, startsAt = new Date()) =>
  tier('FREE').then((p) =>
    db.subscription.create({
      data: {
        accountId,
        planId: p.id,
        source: 'FREE_TIER',
        freeTierPlaceId: placeId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + FREE_TIER_DAYS * DAY),
      },
    }),
  );

beforeEach(async () => {
  await resetDb();
  await importServiceArea(db, readBoundaryFile());
  await importOsmPlaces(db, [
    {
      type: 'node',
      id: 1,
      lat: 30.315,
      lon: -81.686,
      tags: { amenity: 'cafe', name: 'Bold Bean' },
    },
  ]);
  cafe = (await db.businessPlace.findFirstOrThrow()).id;
  owner = await db.businessAccount.create({
    data: { email: 'owner@boldbean.com', passwordHash: 'x' },
  });
  adminId = (await createTestUser('admin_pt', { role: 'ADMIN' })).id;
  await ensureTiers(db);
}, 60_000);

describe('the starter tiers (D202)', () => {
  it('creates Free, Standard and Premium with entitlements and an empty monthly price', async () => {
    const plans = await db.plan.findMany({
      orderBy: { rank: 'asc' },
      include: { entitlements: true, prices: true },
    });
    expect(plans.map((p) => [p.code, p.rank, p.durationDays])).toEqual([
      ['FREE', 1, 30],
      ['STANDARD', 2, null],
      ['PREMIUM', 3, null],
    ]);
    expect(plans.every((p) => p.prices.length === 1 && p.prices[0]!.amountCents === null)).toBe(
      true,
    );
    // D204: the owner's values, read back as one object (a "no limit" null survives).
    expect(planEntitlements(plans[2]!.entitlements)).toEqual({
      'ads.live': 5,
      'ads.library': 20,
      'ads.reach': 'CITY',
      'ads.maxZips': 30,
      'ads.maxDays': null,
      insights: true,
      'insights.reach': 'ALL',
      'insights.nearbyZips': 0,
    });
    expect(planEntitlements(plans[1]!.entitlements)).toMatchObject({
      'ads.live': 3,
      'ads.reach': 'ZIPS',
      'ads.maxZips': 3,
      'insights.reach': 'NEARBY',
      'insights.nearbyZips': 4,
    });
  });

  it('runs again without duplicating or overwriting the admin’s changes', async () => {
    const premium = await tier('PREMIUM');
    await db.planEntitlement.update({
      where: { planId_key: { planId: premium.id, key: 'ads.live' } },
      data: { value: 2 },
    });
    await ensureTiers(db);
    expect(await db.plan.count()).toBe(3);
    const e = await db.planEntitlement.findUniqueOrThrow({
      where: { planId_key: { planId: premium.id, key: 'ads.live' } },
    });
    expect(e.value).toBe(2);
  });

  it('adopts an existing plan with the same name instead of making a second one', async () => {
    await resetDb();
    adminId = (await createTestUser('admin_pt2', { role: 'ADMIN' })).id;
    const old = await createPlan(adminId, {
      name: 'Standard',
      liveAdLimit: 2,
      priceCents: 1500,
      includesInsights: true,
      active: true,
    });
    await ensureTiers(db);
    expect((await tier('STANDARD')).id).toBe(old.id);
    expect(await db.plan.count()).toBe(3);
  });
});

describe('what a business can use (D202)', () => {
  it('nothing without a plan; the tier’s entitlements while it lasts; nothing after', async () => {
    expect((await entitlementsFor(owner.id)).entitlements).toEqual(NO_PLAN_ENTITLEMENTS);
    await freeMonth(owner.id, cafe);
    const now = await entitlementsFor(owner.id);
    expect(now.plan).toMatchObject({ code: 'FREE', rank: 1 });
    expect(now.entitlements).toEqual({
      'ads.live': 1,
      'ads.library': 3,
      'ads.reach': 'OWN_ZIP',
      'ads.maxZips': 1,
      'ads.maxDays': 7,
      insights: true,
      'insights.reach': 'OWN_ZIP',
      'insights.nearbyZips': 0,
    });
    const later = new Date(Date.now() + (FREE_TIER_DAYS + 1) * DAY);
    expect((await entitlementsFor(owner.id, later)).plan).toBeNull();
  });

  it('maintenance marks a subscription past its end as expired', async () => {
    await freeMonth(owner.id, cafe, new Date(Date.now() - (FREE_TIER_DAYS + 1) * DAY));
    expect((await runMaintenance())?.subscriptionsExpired).toBe(1);
    expect((await db.subscription.findFirstOrThrow()).status).toBe('EXPIRED');
  });

  it('the admin Plans page keeps entitlements and prices in step (a new price is a new row)', async () => {
    const standard = await tier('STANDARD');
    await updatePlan(adminId, standard.id, {
      name: 'Standard',
      liveAdLimit: 2,
      priceCents: 2900,
      includesInsights: true,
      active: true,
    });
    const rows = await db.planEntitlement.findMany({ where: { planId: standard.id } });
    expect(Object.fromEntries(rows.map((r) => [r.key, r.value]))).toMatchObject({
      'ads.live': 2,
      insights: true,
      'ads.reach': 'ZIPS', // the page leaves the other entitlements alone
    });
    const prices = await db.planPrice.findMany({
      where: { planId: standard.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(prices.map((p) => [p.amountCents, p.active])).toEqual([
      [null, false],
      [2900, true],
    ]);
  });

  it('ending a plan records the cancellation and its reason', async () => {
    const standard = await tier('STANDARD');
    await db.subscription.create({
      data: { accountId: owner.id, planId: standard.id, startsAt: new Date() },
    });
    await endSubscription(adminId, owner.id, 'Closing for the season');
    const s = await db.subscription.findFirstOrThrow();
    expect(s).toMatchObject({ status: 'CANCELLED', cancelReason: 'Closing for the season' });
    expect(s.cancelledAt).not.toBeNull();
  });
});

describe('database rules (D202)', () => {
  // 🔒 One free month per business, ever.
  it('refuses a second free month for the same business', async () => {
    const first = await freeMonth(owner.id, cafe);
    await db.subscription.update({ where: { id: first.id }, data: { status: 'EXPIRED' } });
    await expect(freeMonth(owner.id, null)).rejects.toThrow();
  });

  // 🔒 …and per place: a new account for the same place doesn't get another.
  it('refuses a second free month for the same place under a new account', async () => {
    await freeMonth(owner.id, cafe);
    const other = await db.businessAccount.create({
      data: { email: 'new@boldbean.com', passwordHash: 'x' },
    });
    await expect(freeMonth(other.id, cafe)).rejects.toThrow();
  });

  // 🔒 One current subscription, counting trialing and past due.
  it('refuses two current subscriptions for one business', async () => {
    const standard = await tier('STANDARD');
    await db.subscription.create({
      data: { accountId: owner.id, planId: standard.id, startsAt: new Date(), status: 'TRIALING' },
    });
    await expect(
      db.subscription.create({
        data: { accountId: owner.id, planId: standard.id, startsAt: new Date() },
      }),
    ).rejects.toThrow();
  });

  // 🔒 Only paid subscriptions carry a price; the free-month place only on a free month.
  it('refuses a price on a free or promo subscription', async () => {
    const standard = await tier('STANDARD');
    const price = await db.planPrice.findFirstOrThrow({ where: { planId: standard.id } });
    await expect(
      db.subscription.create({
        data: {
          accountId: owner.id,
          planId: standard.id,
          startsAt: new Date(),
          source: 'COMP',
          priceId: price.id,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.subscription.create({
        data: {
          accountId: owner.id,
          planId: standard.id,
          startsAt: new Date(),
          source: 'COMP',
          freeTierPlaceId: cafe,
        },
      }),
    ).rejects.toThrow();
  });

  // 🔒 D204: a city-wide ad has no ZIPs or radius.
  it('refuses a city-wide ad that also targets ZIPs', async () => {
    await db.businessPlaceAccess.create({
      data: { accountId: owner.id, placeId: cafe, role: 'OWNER' },
    });
    const ad = (zips: string[]) =>
      db.ad.create({
        data: {
          accountId: owner.id,
          placeId: cafe,
          template: 'BANNER',
          headline: 'Half-price lattes',
          cityWide: true,
          zips,
        },
      });
    await expect(ad(['32204'])).rejects.toThrow();
    await expect(ad([])).resolves.toMatchObject({ cityWide: true });
  });
});
