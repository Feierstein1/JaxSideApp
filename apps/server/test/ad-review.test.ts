import { beforeEach, describe, expect, it } from 'vitest';
import { POST as decisionPOST } from '@/app/api/v1/admin/ads/[id]/decision/route';
import { listPendingAds } from '@/server/admin/ad-review';
import { pickAdsFor, resetAdCache } from '@/server/ads/serve';
import { createSession } from '@/server/auth/sessions';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { ensureTiers } from '@/server/plan-tiers';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// B3.3 / D206: JaxSide approves every ad before it shows; turning one down needs a reason.

const DAY = 86_400_000;
const CAFE = { latitude: 30.315, longitude: -81.686 };
let admin: Record<string, string>;
let cafe: string;
let owner: { id: string };

/** D213: sends the ad's current version as "seen", unless the test gives its own. */
const decide = async (id: string, body: object, headers = admin) => {
  const ad = await db.ad.findUnique({ where: { id }, select: { updatedAt: true } });
  const seen = { seenUpdatedAt: (ad?.updatedAt ?? new Date()).toISOString() };
  return call(decisionPOST as H, 'POST', { headers, params: { id }, body: { ...seen, ...body } });
};
const pending = (headline = 'Half-price lattes') =>
  db.ad.create({
    data: {
      accountId: owner.id,
      placeId: cafe,
      template: 'BANNER',
      headline,
      cityWide: true,
      status: 'PENDING_REVIEW',
      submittedAt: new Date(),
    },
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
  cafe = (await db.businessPlace.findFirstOrThrow()).id;
  owner = await db.businessAccount.create({
    data: { email: 'owner@boldbean.com', passwordHash: 'x' },
  });
  await db.businessPlaceAccess.create({
    data: { accountId: owner.id, placeId: cafe, role: 'OWNER' },
  });
  const free = await db.plan.findUniqueOrThrow({ where: { code: 'FREE' } });
  await db.subscription.create({
    data: { accountId: owner.id, planId: free.id, startsAt: new Date(Date.now() - DAY) },
  });
  admin = await adminHeaders((await createTestUser('mod_ad', { role: 'ADMIN' })).id);
}, 60_000);

describe('ad review (B3.3)', () => {
  it('lists waiting ads; approving puts it live and tells the business', async () => {
    const ad = await pending();
    expect((await listPendingAds()).rows.map((a) => a.id)).toEqual([ad.id]);
    expect((await decide(ad.id, { decision: 'approve' })).status).toBe(200);
    const now = await db.ad.findUniqueOrThrow({ where: { id: ad.id } });
    expect(now.status).toBe('APPROVED');
    expect(now.approvedAt).not.toBeNull();
    expect(await db.adReview.findFirstOrThrow()).toMatchObject({ decision: 'APPROVED' });
    expect(await db.businessNotice.findFirstOrThrow()).toMatchObject({
      accountId: owner.id,
      kind: 'AD_APPROVED',
      link: `/places/${cafe}/ads/${ad.id}`,
    });
    expect((await listPendingAds()).rows).toEqual([]);
    // It shows in the app right away.
    const shown = await pickAdsFor({ userId: null, point: CAFE }, { kind: 'feed' }, 2, []);
    expect(shown.map((a) => a.id)).toEqual([ad.id]);
  });

  it('turning one down needs a reason from the list, which the business sees', async () => {
    const ad = await pending();
    expect((await decide(ad.id, { decision: 'reject' })).status).toBe(400);
    expect((await decide(ad.id, { decision: 'reject', reasonCode: 'MADE_UP' })).status).toBe(400);
    // D211: a free-text reason alone isn't accepted any more.
    expect((await decide(ad.id, { decision: 'reject', reason: 'Bad' })).status).toBe(400);
    const r = await decide(ad.id, {
      decision: 'reject',
      reasonCode: 'AI_FOOD',
      note: 'The burger photo',
    });
    expect(r.status).toBe(200);
    const said =
      'Photos aren’t real: Food and drink pictures must be real photos of what you serve, not made or changed with AI. Note: The burger photo';
    expect((await db.ad.findUniqueOrThrow({ where: { id: ad.id } })).status).toBe('DRAFT');
    expect(await db.adReview.findFirstOrThrow()).toMatchObject({
      decision: 'REJECTED',
      reason: said,
    });
    expect(await db.businessNotice.findFirstOrThrow()).toMatchObject({
      kind: 'AD_REJECTED',
      body: said,
    });
    const log = await db.adminAuditLog.findFirstOrThrow({ where: { action: 'AD_REJECT' } });
    expect(log.metadata).toMatchObject({ reasonCode: 'AI_FOOD' });
  });

  it('“Something else” needs a note, which is what the business reads', async () => {
    const ad = await pending();
    expect((await decide(ad.id, { decision: 'reject', reasonCode: 'OTHER' })).status).toBe(400);
    expect(
      (await decide(ad.id, { decision: 'reject', reasonCode: 'OTHER', note: 'Add your hours' }))
        .status,
    ).toBe(200);
    expect((await db.adReview.findFirstOrThrow()).reason).toBe('Add your hours');
  });

  it('won’t approve past the plan’s live ads, or an ad that isn’t waiting', async () => {
    const first = await pending('First');
    const second = await pending('Second');
    await decide(first.id, { decision: 'approve' });
    const full = await decide(second.id, { decision: 'approve' }); // Free: 1 live ad
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('PLAN_FULL');
    expect((await decide(first.id, { decision: 'approve' })).body.error.code).toBe('STATE');
  });

  // 🔒 Admins only.
  it('refuses anyone but an admin', async () => {
    const ad = await pending();
    const u = await createTestUser('not_admin');
    const token = (await createSession(u.id, 'MOBILE')).token;
    const r = await call(decisionPOST as H, 'POST', {
      token,
      params: { id: ad.id },
      body: { decision: 'approve' },
    });
    expect([401, 403]).toContain(r.status);
    expect((await db.ad.findUniqueOrThrow({ where: { id: ad.id } })).status).toBe('PENDING_REVIEW');
  });

  // 🔒 D213: approvals at the same moment can't go over the tier's live ads (staging bug).
  it('approving several at once still keeps to the plan’s live ads', async () => {
    const ads = await Promise.all(['One', 'Two', 'Three'].map((h) => pending(h)));
    const results = await Promise.all(ads.map((a) => decide(a.id, { decision: 'approve' })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1); // Free: 1 live ad
    expect(results.filter((r) => r.body?.error?.code === 'PLAN_FULL')).toHaveLength(2);
    expect(await db.ad.count({ where: { status: 'APPROVED' } })).toBe(1);
  });

  // 🔒 D212 / D213: never approve words the reviewer didn't see.
  it('refuses a decision when the ad changed after the reviewer opened it', async () => {
    const ad = await pending();
    const seen = ad.updatedAt.toISOString();
    await new Promise((r) => setTimeout(r, 5));
    await db.ad.update({ where: { id: ad.id }, data: { headline: 'Now 2-for-1' } });
    const r = await decide(ad.id, { decision: 'approve', seenUpdatedAt: seen });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('AD_CHANGED');
    expect((await db.ad.findUniqueOrThrow({ where: { id: ad.id } })).status).toBe('PENDING_REVIEW');
    expect((await decide(ad.id, { decision: 'approve' })).status).toBe(200); // after a reload
  });

  it('a photo-rules denial can also give the business a strike', async () => {
    const ad = await pending();
    const r = await decide(ad.id, { decision: 'reject', reasonCode: 'AI_FOOD', strike: true });
    expect(r.status).toBe(200);
    const strike = await db.moderationAction.findFirstOrThrow({
      where: { targetBusinessId: owner.id },
    });
    expect(strike.action).toBe('WARN');
    expect(strike.reason).toContain('real photos');
    // Only with the photo rules.
    const other = await pending('Other');
    expect(
      (await decide(other.id, { decision: 'reject', reasonCode: 'EXPLICIT', strike: true })).status,
    ).toBe(400);
  });
});
