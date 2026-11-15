import { beforeEach, describe, expect, it } from 'vitest';
import { localDate, nearestNeighborhood } from '@jax/shared';
import { POST as adDecisionPOST } from '@/app/api/v1/admin/ads/[id]/decision/route';
import { POST as eventDecidePOST } from '@/app/api/v1/admin/events/[id]/decide/route';
import { POST as adminCreatePOST } from '@/app/api/v1/admin/events/route';
import { listUncheckedAds } from '@/server/admin/ad-review';
import { reviewQueue } from '@/server/admin/review-queue';
import { resetAdCache } from '@/server/ads/serve';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { adminListEvents } from '@/server/events/admin';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { ensureTiers } from '@/server/plan-tiers';
import { endFinishedEventAds } from '@/server/plans/lifecycle';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D247: ads and events go live without approval; JaxSide looks at them afterwards ("Live, not
// looked at"): OK, or take it down with a reason the business reads.

const DAY = 86_400_000;
const CAFE = { latitude: 30.315, longitude: -81.686 };
let admin: Record<string, string>;
let cafe: string;
let owner: string;

const decideAd = async (id: string, body: object) => {
  const ad = await db.ad.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } });
  return call(adDecisionPOST as H, 'POST', {
    headers: admin,
    params: { id },
    body: { seenUpdatedAt: ad.updatedAt.toISOString(), ...body },
  });
};
/** An ad the Owner made live on the website (no review). */
const liveAd = (headline = 'Half-price lattes') =>
  db.ad.create({
    data: {
      accountId: owner,
      placeId: cafe,
      template: 'BANNER',
      headline,
      cityWide: true,
      status: 'APPROVED',
      approvedAt: new Date(),
    },
  });
/** An event the website put on the calendar (APPROVED, nobody at JaxSide has looked). */
async function liveEvent() {
  const r = await call(adminCreatePOST as H, 'POST', {
    headers: admin,
    body: {
      title: 'Trivia night',
      description: 'Teams of four.',
      category: 'trivia',
      setting: 'indoor',
      free: true,
      ...CAFE,
      sessions: [{ date: localDate(new Date(Date.now() + 3 * DAY)), start: '19:00', end: '21:00' }],
    },
  });
  await db.event.update({
    where: { id: r.body.id },
    data: { businessAccountId: owner, reviewedById: null, reviewedAt: null, neighborhood: null },
  });
  return r.body.id as string;
}

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
  cafe = (await db.businessPlace.findFirstOrThrow()).id;
  owner = (await db.businessAccount.create({ data: { email: 'o@x.test', passwordHash: 'x' } })).id;
  await db.businessPlaceAccess.create({ data: { accountId: owner, placeId: cafe, role: 'OWNER' } });
  admin = await adminHeaders((await createTestUser('mod_live', { role: 'ADMIN' })).id);
}, 60_000);

describe('live ads, not looked at (D247)', () => {
  it('lists a live ad until JaxSide says OK (no notice); a later change brings it back', async () => {
    const ad = await liveAd();
    expect((await listUncheckedAds()).rows.map((a) => a.id)).toEqual([ad.id]);
    expect((await reviewQueue()).counts.liveAd).toBe(1);
    expect((await decideAd(ad.id, { decision: 'ok' })).status).toBe(200);
    expect((await listUncheckedAds()).total).toBe(0);
    expect(await db.businessNotice.count()).toBe(0);
    expect((await db.ad.findUniqueOrThrow({ where: { id: ad.id } })).status).toBe('APPROVED');
    // The Owner edits it (stays live): it needs another look.
    await new Promise((r) => setTimeout(r, 5));
    await db.ad.update({ where: { id: ad.id }, data: { headline: 'Two-for-one lattes' } });
    expect((await listUncheckedAds()).rows.map((a) => a.id)).toEqual([ad.id]);
  });

  it('taking it down stops it, keeps the reason and tells the business', async () => {
    const ad = await liveAd();
    expect(
      (await decideAd(ad.id, { decision: 'takedown', reasonCode: 'OTHER', note: 'Wrong price' }))
        .status,
    ).toBe(200);
    expect(await db.ad.findUniqueOrThrow({ where: { id: ad.id } })).toMatchObject({
      status: 'DRAFT',
      approvedAt: null,
    });
    expect(await db.adReview.findFirstOrThrow()).toMatchObject({ decision: 'REJECTED' });
    const n = await db.businessNotice.findFirstOrThrow();
    expect(n).toMatchObject({ kind: 'AD_REJECTED', accountId: owner });
    expect(n.title).toContain('took your ad');
  });

  // 🔒 A take-down needs a reason, and OK / take-down only apply to live or paused ads.
  it('refuses a take-down without a reason, and OK on an ad that isn’t live', async () => {
    const ad = await liveAd();
    expect((await decideAd(ad.id, { decision: 'takedown' })).status).toBe(400);
    const draft = await db.ad.create({
      data: {
        accountId: owner,
        placeId: cafe,
        template: 'BANNER',
        headline: 'Draft',
        status: 'DRAFT',
      },
    });
    expect((await decideAd(draft.id, { decision: 'ok' })).status).toBe(409);
  });
});

describe('live events, not looked at (D247)', () => {
  it('lists website events nobody has looked at; "Looked at, OK" clears it', async () => {
    const id = await liveEvent();
    expect((await adminListEvents({ tab: 'unchecked' })).rows.map((e) => e.id)).toEqual([id]);
    expect((await reviewQueue()).counts.liveEvent).toBe(1);
    const ok = await call(eventDecidePOST as H, 'POST', {
      headers: admin,
      id,
      body: { action: 'ok' },
    });
    expect(ok.status).toBe(200);
    expect((await adminListEvents({ tab: 'unchecked' })).total).toBe(0);
    expect((await db.event.findUniqueOrThrow({ where: { id } })).reviewedAt).not.toBeNull();
  });

  it('removing a live event tells its host why', async () => {
    const id = await liveEvent();
    await call(eventDecidePOST as H, 'POST', {
      headers: admin,
      id,
      body: { action: 'remove', reason: 'Not a real event' },
    });
    expect(await db.businessNotice.findFirstOrThrow()).toMatchObject({
      accountId: owner,
      kind: 'EVENT_DENIED',
      body: 'Not a real event',
    });
  });

  it('a website event without a neighborhood gets one from the daily job', async () => {
    const id = await liveEvent();
    await endFinishedEventAds();
    expect((await db.event.findUniqueOrThrow({ where: { id } })).neighborhood).toBe(
      nearestNeighborhood(CAFE),
    );
  });
});
