import { beforeEach, describe, expect, it } from 'vitest';
import { POST as reportPOST } from '@/app/api/v1/reports/route';
import { getBusiness } from '@/server/admin/businesses';
import { decideCase, getCase } from '@/server/admin/queue';
import { pickAdsFor, resetAdCache } from '@/server/ads/serve';
import { createSession } from '@/server/auth/sessions';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { ensureTiers } from '@/server/plan-tiers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D209: people can report ads (with ad reasons, D207's photo rules among them); the admin
// queue shows them, Remove ends the ad, and the business's page lists them for a strike.

const DAY = 86_400_000;
const CAFE = { latitude: 30.315, longitude: -81.686 };
const reading = () => ({ ...CAFE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let owner: { id: string };
let adId: string;
let fan: { id: string; token: string };
let adminId: string;

const report = (reason: string, target: object = { type: 'ad', id: adId }) =>
  call(reportPOST as H, 'POST', {
    token: fan.token,
    body: { reading: reading(), target, reason },
  });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
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
  const cafe = (await db.businessPlace.findFirstOrThrow()).id;
  owner = await db.businessAccount.create({
    data: { email: 'owner@boldbean.com', passwordHash: 'x' },
  });
  await db.businessPlaceAccess.create({
    data: { accountId: owner.id, placeId: cafe, role: 'OWNER' },
  });
  const plan = await db.plan.findUniqueOrThrow({ where: { code: 'PREMIUM' } });
  await db.subscription.create({
    data: { accountId: owner.id, planId: plan.id, startsAt: new Date(Date.now() - DAY) },
  });
  adId = (
    await db.ad.create({
      data: {
        accountId: owner.id,
        placeId: cafe,
        template: 'BANNER',
        headline: 'Our juiciest burger',
        status: 'APPROVED',
        approvedAt: new Date(),
        cityWide: true,
      },
    })
  ).id;
  const u = await createTestUser('fan_ar', {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - 30 * DAY),
  });
  fan = { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
  adminId = (await createTestUser('mod_ar', { role: 'ADMIN' })).id;
}, 60_000);

describe('reporting ads (D209)', () => {
  it('reaches the queue as an ad from the business, and its page lists it', async () => {
    expect((await report('AD_AI_FOOD')).status).toBe(202);
    const c = await getCase({ type: 'ad', id: adId });
    expect(c.author).toMatchObject({ business: true, signInName: 'owner@boldbean.com' });
    expect((await getBusiness(owner.id)).reports.map((r) => r.what)).toEqual(['ad']);
    // Never hidden automatically: still shown until an admin decides.
    const shown = await pickAdsFor({ userId: null, point: CAFE }, { kind: 'feed' }, 1, []);
    expect(shown.map((a) => a.id)).toEqual([adId]);
  });

  it('Remove ends the ad (it stops showing; the business can’t just resume it)', async () => {
    await report('AD_AI_IMAGE');
    await decideCase({ adminId, ref: { type: 'ad', id: adId }, decision: 'remove' });
    expect((await db.ad.findUniqueOrThrow({ where: { id: adId } })).status).toBe('ENDED');
    expect(await pickAdsFor({ userId: null, point: CAFE }, { kind: 'feed' }, 1, [])).toEqual([]);
  });

  // 🔒 Only ad reasons for ads (the reverse is covered in the shared schema tests).
  it('refuses a reason that isn’t for ads', async () => {
    expect((await report('DOXXING')).status).toBe(400);
    expect(await db.report.count()).toBe(0);
  });

  // 🔒 An ad that was never approved can't be reported (it was never shown).
  it('refuses reporting a draft', async () => {
    await db.ad.update({ where: { id: adId }, data: { status: 'DRAFT' } });
    expect((await report('AD_MISLEADING')).status).toBe(404);
  });
});
