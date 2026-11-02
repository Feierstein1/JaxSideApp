import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as insightsRoute } from '@/app/api/places/[placeId]/insights/route';
import { db } from '@/server/db';
import { periodBounds, placeInsights } from '@/server/insights';
import { authed, makeAccount, makePlace, resetBusinessData, signIn } from './helpers';

// B2.1: counts for a place's Owner (D116; Q29: with a plan that includes them).

const ZIP = '99990'; // a made-up ZIP area drawn around the test place
const OTHER = '99991';
const NOW = new Date('2026-10-15T16:00:00Z'); // the last 7 full days: Oct 8–14
const ctx = (placeId: string) => ({ params: Promise.resolve({ placeId }) }) as never;

let owner: Awaited<ReturnType<typeof makeAccount>>;
let placeId: string;

async function giveInsightsPlan(accountId: string, includesInsights = true) {
  const plan = await db.plan.create({
    data: {
      name: `Test ${includesInsights ? 'with' : 'without'} insights ${accountId.slice(-8)}`,
      liveAdLimit: 1,
      includesInsights,
    },
  });
  await db.subscription.create({
    data: { accountId, planId: plan.id, startsAt: new Date('2026-01-01'), comped: true },
  });
}

async function dayRow(day: string, visitors: number, extra: Partial<Record<string, number>> = {}) {
  await db.areaStatsDaily.create({
    data: {
      day: new Date(`${day}T00:00:00Z`),
      zip: ZIP,
      visitors,
      morning: extra.morning ?? 0,
      afternoon: extra.afternoon ?? 0,
      evening: extra.evening ?? 0,
      night: extra.night ?? 0,
      newThisMonth: extra.newThisMonth ?? 0,
    },
  });
}

async function cleanStats() {
  await db.areaStatsDaily.deleteMany({ where: { zip: { in: [ZIP, OTHER] } } });
  await db.areaStatsWeekly.deleteMany({ where: { zip: { in: [ZIP, OTHER] } } });
  await db.areaStatsMonthly.deleteMany({ where: { zip: { in: [ZIP, OTHER] } } });
  await db.areaFlowDaily.deleteMany({ where: { OR: [{ zipA: ZIP }, { zipB: ZIP }] } });
  await db.$executeRaw`DELETE FROM "ZipArea" WHERE zip IN (${ZIP}, ${OTHER})`;
}

beforeEach(async () => {
  await resetBusinessData();
  await cleanStats();
  owner = await makeAccount();
  const place = await makePlace('Bold Bean', 30.33, -81.66);
  placeId = place.id;
  await db.businessPlaceAccess.create({ data: { accountId: owner.id, placeId, role: 'OWNER' } });
  // A small square ZIP area around the place.
  await db.$executeRaw`
    INSERT INTO "ZipArea" (zip, geom) VALUES (${ZIP}, ST_GeogFromText(
      'MULTIPOLYGON(((-81.67 30.32, -81.65 30.32, -81.65 30.34, -81.67 30.34, -81.67 30.32)))'))`;
});
afterEach(cleanStats);

describe('B2.1 insights', () => {
  it('uses the last full days in Jacksonville time', () => {
    expect(periodBounds('7d', NOW)).toEqual({ from: '2026-10-08', to: '2026-10-14', days: 7 });
    expect(periodBounds('30d', NOW).from).toBe('2026-09-15');
  });

  it('shows the area’s counts and hides every group under 10', async () => {
    await giveInsightsPlan(owner.id);
    // Thu Oct 8 – Wed Oct 14: 20 people a weekday, 5 on each weekend day.
    for (const [day, n] of [
      ['2026-10-08', 20],
      ['2026-10-09', 20],
      ['2026-10-10', 5],
      ['2026-10-11', 5],
      ['2026-10-12', 20],
      ['2026-10-13', 20],
      ['2026-10-14', 20],
    ] as const) {
      await dayRow(day, n, {
        morning: n === 20 ? 4 : 1,
        afternoon: n === 20 ? 10 : 2,
        newThisMonth: 1,
      });
    }
    await dayRow('2026-10-01', 500); // outside the period: not counted
    await db.areaStatsWeekly.create({
      data: { weekStart: new Date('2026-10-05'), zip: ZIP, visitors: 7 },
    });
    await db.areaStatsMonthly.create({
      data: { month: new Date('2026-09-01'), zip: ZIP, visitors: 40, visitDays: 100 },
    });
    await db.areaFlowDaily.createMany({
      data: [
        { day: new Date('2026-10-09'), zipA: ZIP, zipB: OTHER, visitors: 12 },
        { day: new Date('2026-10-09'), zipA: '11111', zipB: ZIP, visitors: 3 }, // too few
      ],
    });
    await db.placeStatsDaily.create({
      data: {
        day: new Date('2026-10-10'),
        placeId,
        posts: 12,
        comments: 4,
        people: 9,
        favorites: 0,
        votes: 30,
      },
    });

    const r = await placeInsights(owner, placeId, '7d', NOW);
    expect(r.area).toMatchObject({
      zip: ZIP,
      peopleDays: 110,
      perDay: 15.7,
      weekdayAvg: 20,
      weekendAvg: null, // 5 a day: an average under 10 would reveal small daily groups
      newThisMonth: null, // 7
      partOfDay: { morning: 22, afternoon: 54, evening: null, night: null },
      lastWeek: { start: '2026-10-05', people: null }, // 7 people
      lastMonth: { start: '2026-09-01', people: 40, avgDays: 2.5 },
      alsoVisited: [{ zip: OTHER, peopleDays: 12 }],
    });
    expect(r.activity).toEqual({
      posts: 12,
      comments: null,
      peopleDays: null,
      favorites: null,
      votes: 30,
    });
  });

  it('🔒 nothing about any one person, ever', async () => {
    await giveInsightsPlan(owner.id);
    await dayRow('2026-10-12', 25);
    const s = await signIn();
    const res = await insightsRoute(
      authed('GET', `/api/places/${placeId}/insights`, s),
      ctx(placeId),
    );
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).not.toMatch(/visitorMonth|visitorWeek|userId|username|email|latitude|longitude/i);
    const body = JSON.parse(raw);
    expect(Object.keys(body).sort()).toEqual(['activity', 'area', 'minGroup', 'period', 'place']);
  });

  it('only with a plan that includes insights, and a live one', async () => {
    const err = (p: Promise<unknown>) =>
      p.then(
        () => null,
        (e) => (e as { code: string }).code,
      );
    expect(await err(placeInsights(owner, placeId, '7d', NOW))).toBe('PLAN');
    await giveInsightsPlan(owner.id, false);
    expect(await err(placeInsights(owner, placeId, '7d', NOW))).toBe('PLAN');
    await db.subscription.deleteMany();
    await giveInsightsPlan(owner.id);
    await db.subscription.updateMany({ data: { endsAt: new Date('2026-10-01') } }); // a promo that ended
    expect(await err(placeInsights(owner, placeId, '7d', NOW))).toBe('PLAN');
  });

  it('🔒 Owner only; not for another business, not for places of worship', async () => {
    await giveInsightsPlan(owner.id);
    const staff = await makeAccount({ username: 'sam.bb' });
    await db.businessPlaceAccess.create({
      data: { accountId: staff.id, placeId, role: 'MANAGER' },
    });
    await expect(placeInsights(staff, placeId, '7d', NOW)).rejects.toMatchObject({
      status: 403,
      code: 'ROLE',
    });

    const other = await makeAccount({ email: 'other@example.com' });
    await giveInsightsPlan(other.id);
    await expect(placeInsights(other, placeId, '7d', NOW)).rejects.toMatchObject({ status: 404 });

    await db.businessPlace.update({ where: { id: placeId }, data: { category: 'church' } });
    await expect(placeInsights(owner, placeId, '7d', NOW)).rejects.toMatchObject({
      code: 'NOT_AVAILABLE',
    });
  });
});
