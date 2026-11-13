import { beforeEach, describe, expect, it } from 'vitest';
import { POST as interestPOST } from '@/app/api/v1/ads/[id]/interest/route';
import { POST as adsPOST } from '@/app/api/v1/ads/route';
import { POST as tapPOST } from '@/app/api/v1/ads/[id]/tap/route';
import { POST as viewsPOST } from '@/app/api/v1/ads/views/route';
import { POST as guestsPOST } from '@/app/api/v1/guests/route';
import { POST as installPOST } from '@/app/api/v1/installations/route';
import { pickAdsFor, resetAdCache, weightedPick, zipAt } from '@/server/ads/serve';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { INSTALLATION_HEADER } from '@/server/installations';
import { runMaintenance } from '@/server/jobs/maintenance';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { ensureTiers } from '@/server/plan-tiers';
import { importZipAreas } from '@/server/stats/zip-areas';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D206 / B3.4: which ads a reader gets, and how views and Interested are counted.

const DAY = 86_400_000;
const CAFE = { latitude: 30.315, longitude: -81.686 };
const reading = (p = CAFE) => ({ ...p, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let cafe: string;
let bar: string;
let cafeZip: string;
let owner: { id: string };
let other: { id: string };
let user: { id: string; token: string };

async function business(email: string, placeId: string, tier: 'STANDARD' | 'PREMIUM') {
  const a = await db.businessAccount.create({ data: { email, passwordHash: 'x' } });
  await db.businessPlaceAccess.create({ data: { accountId: a.id, placeId, role: 'OWNER' } });
  const plan = await db.plan.findUniqueOrThrow({ where: { code: tier } });
  await db.subscription.create({
    data: { accountId: a.id, planId: plan.id, startsAt: new Date(Date.now() - DAY) },
  });
  return a;
}

async function ad(
  accountId: string,
  placeId: string,
  extra: Partial<{
    headline: string;
    zips: string[];
    cityWide: boolean;
    adultsOnly: boolean;
    status: 'APPROVED' | 'PAUSED';
    startsAt: Date;
    approvedAt: Date;
    linkUrl: string;
    linkLabel: string;
    template: 'BANNER' | 'POST' | 'FEATURE';
  }> = {},
) {
  const a = await db.ad.create({
    data: {
      accountId,
      placeId,
      template: extra.template ?? 'BANNER',
      headline: extra.headline ?? 'Half-price lattes',
      status: extra.status ?? 'APPROVED',
      zips: extra.zips ?? [],
      cityWide: extra.cityWide ?? !extra.zips,
      adultsOnly: extra.adultsOnly ?? false,
      startsAt: extra.startsAt ?? null,
      approvedAt: extra.approvedAt ?? new Date(),
      linkUrl: extra.linkUrl ?? null,
      linkLabel: extra.linkLabel ?? null,
    },
  });
  resetAdCache();
  return a;
}

const ask = (token: string, body: object = {}) =>
  call(adsPOST as H, 'POST', {
    token,
    body: { reading: reading(), context: { kind: 'feed' }, count: 3, ...body },
  });

async function guestToken() {
  const inst = (await call(installPOST as H, 'POST', { body: {} })).body
    .installationToken as string;
  const r = await call(guestsPOST as H, 'POST', {
    body: {},
    headers: { [INSTALLATION_HEADER]: inst },
  });
  return r.body.token as string;
}

beforeEach(async () => {
  await resetDb();
  await importServiceArea(db, readBoundaryFile());
  await importZipAreas(db);
  await relaxBurstLimits();
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
    { type: 'node', id: 2, lat: 30.316, lon: -81.687, tags: { amenity: 'bar', name: 'Night Owl' } },
  ]);
  cafe = (await db.businessPlace.findFirstOrThrow({ where: { name: 'Bold Bean' } })).id;
  bar = (await db.businessPlace.findFirstOrThrow({ where: { name: 'Night Owl' } })).id;
  cafeZip = (await zipAt(CAFE))!;
  owner = await business('owner@boldbean.com', cafe, 'PREMIUM');
  other = await business('owner@nightowl.com', bar, 'PREMIUM');
  const u = await createTestUser('reader_a', {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - 30 * DAY),
  });
  user = { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}, 120_000);

describe('which ads a reader gets (D206)', () => {
  it('city-wide ads reach everyone; ZIP ads only readers inside the ZIP', async () => {
    expect(cafeZip).toMatch(/^\d{5}$/);
    const city = await ad(owner.id, cafe, { headline: 'City' });
    const here = await ad(other.id, bar, { zips: [cafeZip], headline: 'Here' });
    await ad(other.id, bar, { zips: ['00000'], headline: 'Elsewhere' });
    const r = await ask(user.token);
    expect(r.status).toBe(200);
    expect(r.body.ads.map((a: { id: string }) => a.id).sort()).toEqual([city.id, here.id].sort());
    expect(r.body.ads[0]).toMatchObject({ template: 'BANNER', myChoice: null });
    expect(r.body.layout).toEqual({ first: 4, every: 8, cooldownHours: 3 });
    expect(JSON.stringify(r.body)).not.toContain('owner@'); // never who made it
  });

  it('one ad per business, fresh ones before the ones the phone showed recently', async () => {
    const a1 = await ad(owner.id, cafe, { headline: 'One' });
    const a2 = await ad(owner.id, cafe, { headline: 'Two' });
    const got = (await ask(user.token)).body.ads as { id: string }[];
    expect(got).toHaveLength(1);
    const again = (await ask(user.token, { seen: [got[0]!.id] })).body.ads as { id: string }[];
    expect(again.map((a) => a.id)).toEqual([got[0]!.id === a1.id ? a2.id : a1.id]);
    // D240: everything in the cooldown: a recently seen one fills the slot rather than
    // leaving it empty (still one per business).
    expect((await ask(user.token, { seen: [a1.id, a2.id] })).body.ads).toHaveLength(1);
  });

  it('nothing when the plan ended, the business is suspended, the ad is paused or not started', async () => {
    await ad(owner.id, cafe, { status: 'PAUSED' });
    await ad(owner.id, cafe, { startsAt: new Date(Date.now() + DAY) });
    await ad(other.id, bar);
    await db.businessAccount.update({
      where: { id: other.id },
      data: { suspendedUntil: new Date(Date.now() + DAY) },
    });
    resetAdCache();
    expect((await ask(user.token)).body.ads).toEqual([]);
    await db.businessAccount.update({ where: { id: other.id }, data: { suspendedUntil: null } });
    await db.subscription.updateMany({
      where: { accountId: other.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    resetAdCache();
    expect((await ask(user.token)).body.ads).toEqual([]);
  });

  it('a business shows at most its plan’s live ads (its oldest approved first)', async () => {
    await db.subscription.deleteMany({ where: { accountId: owner.id } });
    const standard = await db.plan.findUniqueOrThrow({ where: { code: 'FREE' } });
    await db.subscription.create({
      data: { accountId: owner.id, planId: standard.id, startsAt: new Date(Date.now() - DAY) },
    });
    const old = await ad(owner.id, cafe, { approvedAt: new Date(Date.now() - DAY) });
    await ad(owner.id, cafe, { approvedAt: new Date() });
    for (let i = 0; i < 5; i++) {
      const got = (await ask(user.token)).body.ads as { id: string }[];
      expect(got.map((a) => a.id)).toEqual([old.id]); // Free: 1 live ad
    }
  });

  it('21+ ads never go to guests', async () => {
    await ad(owner.id, cafe, { adultsOnly: true });
    const asGuest = await ask(await guestToken());
    expect(asGuest.body.ads).toEqual([]);
    expect(asGuest.body.layout.every).toBe(6); // guests see ads a little more often
    expect((await ask(user.token)).body.ads).toHaveLength(1);
  });

  it('Not interested hides that business; taking it back shows it again', async () => {
    const a = await ad(owner.id, cafe);
    await ad(owner.id, cafe, { headline: 'Another from them' });
    const choose = (choice: string | null) =>
      call(interestPOST as H, 'POST', { token: user.token, id: a.id, body: { choice } });
    expect((await choose('NOT_INTERESTED')).body.choice).toBe('NOT_INTERESTED');
    expect((await ask(user.token)).body.ads).toEqual([]);
    await choose(null);
    expect((await ask(user.token)).body.ads).toHaveLength(1);
  });

  it('an ad-free topic gets no ads; a place with a plan shows only its own', async () => {
    await ad(owner.id, cafe, { headline: 'Cafe' });
    const nightOwl = await ad(other.id, bar, { headline: 'Bar' });
    const creator = await createTestUser('topic_maker');
    const topic = await db.cityTopic.create({
      data: { title: 'Jaguars', createdById: creator.id, adFree: true },
    });
    expect((await ask(user.token, { context: { kind: 'topic', id: topic.id } })).body.ads).toEqual(
      [],
    );
    const atBar = await ask(user.token, { context: { kind: 'place', id: bar } });
    expect(atBar.body.ads.map((x: { id: string }) => x.id)).toEqual([nightOwl.id]);
  });
});

describe('the weighted pick (D206)', () => {
  const pool = (n: number, boosted: number[] = []) =>
    Array.from({ length: n }, (_, i) => ({
      item: i,
      weight: boosted.includes(i) ? 2 : 1,
      boosted: boosted.includes(i),
      group: `b${i}`,
    }));

  it('boosted ads come up about twice as often', () => {
    let seed = 1;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const hits = [0, 0];
    for (let i = 0; i < 4000; i++) hits[weightedPick(pool(2, [0]), 1, 1, rand)[0]!]!++;
    expect(hits[0]! / hits[1]!).toBeGreaterThan(1.7);
    expect(hits[0]! / hits[1]!).toBeLessThan(2.3);
  });

  it('caps boosted picks so other businesses still get through', () => {
    const got = weightedPick(pool(6, [0, 1, 2, 3]), 4, 2, () => 0);
    expect(got.filter((i) => i < 4)).toHaveLength(2);
    expect(got).toHaveLength(4);
  });

  it('favorited places get the boost', async () => {
    const fav = await ad(owner.id, cafe);
    await ad(other.id, bar);
    await db.favoritePlace.create({ data: { userId: user.id, placeId: cafe } });
    let firstFav = 0;
    for (let i = 0; i < 200; i++) {
      const [first] = await pickAdsFor({ userId: user.id, point: CAFE }, { kind: 'feed' }, 1, []);
      if (first?.id === fav.id) firstFav++;
    }
    expect(firstFav).toBeGreaterThan(110); // about 2 in 3
  });
});

describe('counting (D206)', () => {
  it('a view counts once per person per ad per day; another person counts again', async () => {
    const a = await ad(owner.id, cafe);
    const view = (token: string) =>
      call(viewsPOST as H, 'POST', { token, body: { adIds: [a.id, a.id] } });
    expect((await view(user.token)).body.counted).toBe(1);
    expect((await view(user.token)).body.counted).toBe(0);
    expect((await view(await guestToken())).body.counted).toBe(1);
    expect((await db.adDailyStats.findFirstOrThrow()).views).toBe(2);
    // The view record never holds the person's ID.
    const marks = await db.adViewMark.findMany();
    expect(JSON.stringify(marks)).not.toContain(user.id);
  });

  it('Interested / Not interested move between counts and can be taken back', async () => {
    const a = await ad(owner.id, cafe);
    const choose = (choice: string | null) =>
      call(interestPOST as H, 'POST', { token: user.token, id: a.id, body: { choice } });
    await choose('INTERESTED');
    await choose('INTERESTED'); // once per person
    expect(await db.adDailyStats.findFirstOrThrow()).toMatchObject({
      interested: 1,
      notInterested: 0,
    });
    await choose('NOT_INTERESTED');
    expect(await db.adDailyStats.findFirstOrThrow()).toMatchObject({
      interested: 0,
      notInterested: 1,
    });
    await choose(null);
    expect(await db.adDailyStats.findFirstOrThrow()).toMatchObject({ notInterested: 0 });
    expect(await db.adInterest.count()).toBe(0);
  });

  // 🔒 Guests can't mark ads; drafts can't be counted.
  it('refuses Interested from guests and counting an ad that was never approved', async () => {
    const draft = await db.ad.create({
      data: { accountId: owner.id, placeId: cafe, template: 'BANNER', headline: 'Draft' },
    });
    const g = await guestToken();
    expect(
      (
        await call(interestPOST as H, 'POST', {
          token: g,
          id: draft.id,
          body: { choice: 'INTERESTED' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(interestPOST as H, 'POST', {
          token: user.token,
          id: draft.id,
          body: { choice: 'INTERESTED' },
        })
      ).status,
    ).toBe(404);
    expect(
      (await call(viewsPOST as H, 'POST', { token: user.token, body: { adIds: [draft.id] } })).body
        .counted,
    ).toBe(0);
  });

  it('maintenance deletes view marks after two days', async () => {
    const a = await ad(owner.id, cafe);
    await db.adViewMark.create({
      data: { adId: a.id, viewer: 'x'.repeat(43), day: new Date(Date.now() - 4 * DAY) },
    });
    expect((await runMaintenance())?.adViewMarksDeleted).toBe(1);
  });
});

describe('links in ads (D216)', () => {
  const link = { linkUrl: 'https://boldbean.example/menu', linkLabel: 'See the menu' };

  it('a paid plan shows the link button; Free never does', async () => {
    await ad(owner.id, cafe, link);
    expect((await ask(user.token)).body.ads[0].link).toEqual({
      url: 'https://boldbean.example/menu',
      label: 'See the menu',
    });
    // Moved down to Free: the button goes at once (the website also pauses such ads).
    const free = await db.plan.findUniqueOrThrow({ where: { code: 'FREE' } });
    await db.subscription.updateMany({ where: { accountId: owner.id }, data: { planId: free.id } });
    resetAdCache();
    expect((await ask(user.token)).body.ads[0].link).toBeNull();
  });

  it('a tap counts once per person per ad per day; another person counts again', async () => {
    const a = await ad(owner.id, cafe, link);
    const tap = (token: string) => call(tapPOST as H, 'POST', { token, id: a.id, body: {} });
    expect((await tap(user.token)).body.counted).toBe(true);
    expect((await tap(user.token)).body.counted).toBe(false);
    expect((await tap(await guestToken())).body.counted).toBe(true);
    expect((await db.adDailyStats.findFirstOrThrow()).taps).toBe(2);
  });

  // 🔒 The database keeps links to https with button text.
  it('refuses a link without https, or without its button text', async () => {
    await expect(
      ad(owner.id, cafe, { linkUrl: 'http://x.example', linkLabel: 'Go' }),
    ).rejects.toThrow();
    await expect(ad(owner.id, cafe, { linkUrl: 'https://x.example' })).rejects.toThrow();
    const plain = await ad(owner.id, cafe);
    const tap = await call(tapPOST as H, 'POST', { token: user.token, id: plain.id, body: {} });
    expect(tap.body.counted).toBe(false); // nothing to count on an ad without a link
  });
});

describe('variety in one list (D240)', () => {
  it('fills empty slots with recently seen ads, still never twice in a row', async () => {
    const c1 = await ad(owner.id, cafe, { headline: 'Cafe' });
    const b1 = await ad(other.id, bar, { headline: 'Bar' });
    // Both seen: both still come back (two businesses, two slots).
    const got = await pickAdsFor({ userId: user.id, point: CAFE }, { kind: 'feed' }, 3, [
      c1.id,
      b1.id,
    ]);
    expect(got.map((a) => a.headline).sort()).toEqual(['Bar', 'Cafe']);
    // Already in this list right before: not repeated next to itself.
    const next = await pickAdsFor(
      { userId: user.id, point: CAFE },
      { kind: 'feed' },
      1,
      [c1.id, b1.id],
      new Date(),
      undefined,
      [c1.id, b1.id],
    );
    expect(next).toEqual([]);
  });

  const pick = (inList: string[], count = 3, rand?: () => number) =>
    pickAdsFor(
      { userId: user.id, point: CAFE },
      { kind: 'feed' },
      count,
      [],
      new Date(),
      rand,
      inList,
    );

  it('one large ad per list: never two in a batch, none once the list has one', async () => {
    const big1 = await ad(owner.id, cafe, { template: 'FEATURE', headline: 'Big one' });
    await ad(other.id, bar, { template: 'FEATURE', headline: 'Big two' });
    for (let i = 0; i < 10; i++) {
      resetAdCache();
      const got = await pick([]);
      expect(got.filter((a) => a.template === 'FEATURE').length).toBeLessThanOrEqual(1);
    }
    resetAdCache();
    expect((await pick([big1.id])).filter((a) => a.template === 'FEATURE')).toEqual([]);
  });

  it('a business at most twice per list, and never right after itself', async () => {
    const a1 = await ad(owner.id, cafe, { headline: 'A1' });
    const a2 = await ad(owner.id, cafe, { headline: 'A2' });
    await ad(owner.id, cafe, { headline: 'A3' });
    const b1 = await ad(other.id, bar, { headline: 'B1' });
    const heads = async (inList: string[]) => (await pick(inList)).map((a) => a.headline);
    // Right after one of its own: not this business.
    expect((await heads([a1.id])).every((h) => !h.startsWith('A'))).toBe(true);
    // Once with another in between: it may come back.
    expect((await heads([a1.id, b1.id])).some((h) => h.startsWith('A'))).toBe(true);
    // Twice already: not again.
    expect((await heads([a1.id, a2.id, b1.id])).every((h) => !h.startsWith('A'))).toBe(true);
  });

  it('paid tiers weigh more: Premium 3, Standard 2, Free 1', async () => {
    // A free business's ad first in line, a premium business's second.
    await db.subscription.updateMany({
      where: { accountId: other.id },
      data: { planId: (await db.plan.findUniqueOrThrow({ where: { code: 'FREE' } })).id },
    });
    await ad(other.id, bar, { headline: 'Free', approvedAt: new Date(Date.now() - 60_000) });
    await ad(owner.id, cafe, { headline: 'Premium', approvedAt: new Date() });
    // Weights 1 and 3: a draw at 30% of the total lands on the second (Premium); with equal
    // weights the same draw would land on the first.
    const [first] = await pick([], 1, () => 0.3);
    expect(first!.headline).toBe('Premium');
  });
});
