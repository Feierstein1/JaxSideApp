import { beforeEach, describe, expect, it } from 'vitest';
import { POST as feedPOST } from '@/app/api/v1/feed/route';
import { PATCH as areaStatsPATCH } from '@/app/api/v1/me/area-stats/route';
import { GET as meGET } from '@/app/api/v1/me/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { clearVisitKeyCache, recordAreaVisit, weekStart } from '@/server/stats/area-visits';
import { runAreaStats } from '@/server/stats/rollup';
import { importZipAreas } from '@/server/stats/zip-areas';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// P14 (D116): anonymous area statistics, "count, don't record".

const FIVE_POINTS = { latitude: 30.3149, longitude: -81.6853 }; // ZIP 32204
const JAX_BEACH = { latitude: 30.2856, longitude: -81.3884 }; // ZIP 32250
const OCEAN = { latitude: 30.3, longitude: -81.2 }; // offshore: no ZIP area
const reading = (p = FIVE_POINTS) => ({ ...p, accuracyMeters: 10, timestamp: Date.now() - 2_000 });
/** A moment in Jacksonville local time (EDT in September/October: UTC−4). */
const local = (day: string, hour: number) =>
  new Date(Date.parse(`${day}T00:30:00Z`) + (hour + 4) * 3_600_000);

let alice: { id: string; token: string };
let bob: { id: string; token: string };

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  invalidateConfigCache();
  clearVisitKeyCache();
  await importServiceArea(db, readBoundaryFile());
  await importZipAreas(db);
  for (const [name, set] of [
    ['alice_s', (u: typeof alice) => (alice = u)],
    ['bob_s', (u: typeof alice) => (bob = u)],
  ] as const) {
    const u = await createTestUser(name, { emailVerifiedAt: new Date() });
    set({ id: u.id, token: (await createSession(u.id, 'MOBILE')).token });
  }
});

const feed = (token: string, extra: object = {}, at = FIVE_POINTS) =>
  call(feedPOST as H, 'POST', { token, body: { reading: reading(at), ...extra } });

describe('recording a visit (D116)', () => {
  it('opening the feed notes the ZIP, the day and the part of the day; no ID, no coordinates', async () => {
    expect((await feed(alice.token)).status).toBe(200);
    const rows = await db.areaVisit.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.zip).toBe('32204');
    // The row holds two 16-byte codes, not the account ID (and the table has no ID column).
    expect(Buffer.from(rows[0]!.visitorMonth).length).toBe(16);
    expect(Buffer.from(rows[0]!.visitorMonth).toString('hex')).not.toContain(
      alice.id.replace(/-/g, ''),
    );
    const cols = (
      await db.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'AreaVisit'`
    ).map((c) => c.column_name);
    expect(cols.sort()).toEqual(['day', 'dayparts', 'visitorMonth', 'visitorWeek', 'zip']);
    // Opening it again, or loading more posts, adds nothing.
    await feed(alice.token);
    await feed(alice.token, {
      cursor: Buffer.from(
        '{"t":"2026-01-01T00:00:00Z","id":"00000000-0000-7000-8000-000000000000"}',
      ).toString('base64url'),
    });
    expect(await db.areaVisit.count()).toBe(1);
  });

  it('a second part of the same day is added to the same row; a new ZIP gets its own row', async () => {
    await recordAreaVisit(alice.id, FIVE_POINTS, local('2026-10-21', 8)); // morning
    await recordAreaVisit(alice.id, FIVE_POINTS, local('2026-10-21', 19)); // evening
    await recordAreaVisit(alice.id, JAX_BEACH, local('2026-10-21', 20));
    await recordAreaVisit(alice.id, OCEAN, local('2026-10-21', 21)); // not in a ZIP area
    const rows = await db.areaVisit.findMany({ orderBy: { zip: 'asc' } });
    expect(rows.map((r) => [r.zip, r.dayparts])).toEqual([
      ['32204', 1 | 4],
      ['32250', 4],
    ]);
  });

  // 🔒 The off switch.
  it('people who switch it off are not counted', async () => {
    const r = await call(areaStatsPATCH as H, 'PATCH', {
      token: alice.token,
      body: { optOut: true },
    });
    expect(r.status).toBe(200);
    expect((await call(meGET as H, 'GET', { token: alice.token })).body.user.areaStatsOptOut).toBe(
      true,
    );
    await feed(alice.token);
    expect(await db.areaVisit.count()).toBe(0);
    await feed(bob.token);
    expect(await db.areaVisit.count()).toBe(1);
  });
});

describe('the nightly counting (D116)', () => {
  it('turns finished days, weeks and months into counts, then forgets the people', async () => {
    // Alice: Mon Sep 7 in 32204 (morning); Tue Sep 8 in 32204 (evening) and 32250.
    // Bob: Tue Sep 8 in 32204 (night).
    await recordAreaVisit(alice.id, FIVE_POINTS, local('2026-09-07', 9));
    await recordAreaVisit(alice.id, FIVE_POINTS, local('2026-09-08', 18));
    await recordAreaVisit(alice.id, JAX_BEACH, local('2026-09-08', 19));
    await recordAreaVisit(bob.id, FIVE_POINTS, local('2026-09-08', 23));

    const report = await runAreaStats(local('2026-10-02', 12));
    expect(report.monthsCounted).toBe(1);

    const day = (d: string) => new Date(`${d}T00:00:00Z`);
    const daily = await db.areaStatsDaily.findMany({ orderBy: [{ day: 'asc' }, { zip: 'asc' }] });
    expect(
      daily.map((r) => [
        r.day.toISOString().slice(0, 10),
        r.zip,
        r.visitors,
        r.morning,
        r.evening,
        r.night,
        r.newThisMonth,
      ]),
    ).toEqual([
      ['2026-09-07', '32204', 1, 1, 0, 0, 1],
      ['2026-09-08', '32204', 2, 0, 1, 1, 1], // alice was already counted this month
      ['2026-09-08', '32250', 1, 0, 1, 0, 1],
    ]);
    expect(await db.areaFlowDaily.findMany()).toEqual([
      { day: day('2026-09-08'), zipA: '32204', zipB: '32250', visitors: 1 },
    ]);
    // Week and month: alice counts once in 32204 although she came twice.
    const week = weekStart('2026-09-08');
    expect(
      (
        await db.areaStatsWeekly.findUniqueOrThrow({
          where: { weekStart_zip: { weekStart: day(week), zip: '32204' } },
        })
      ).visitors,
    ).toBe(weekStart('2026-09-07') === week ? 2 : 1);
    expect(
      await db.areaStatsMonthly.findUniqueOrThrow({
        where: { month_zip: { month: day('2026-09-01'), zip: '32204' } },
      }),
    ).toMatchObject({ visitors: 2, visitDays: 3 });

    // 🔒 Forgotten: September's rows and keys are gone.
    expect(await db.areaVisit.count()).toBe(0);
    expect(
      await db.visitKey.count({ where: { period: { in: ['month:2026-09', `week:${week}`] } } }),
    ).toBe(0);

    // Running again counts nothing twice.
    const again = await runAreaStats(local('2026-10-02', 12));
    expect(again).toMatchObject({ daysCounted: 0, weeksCounted: 0, monthsCounted: 0 });
    expect(await db.areaStatsDaily.count()).toBe(3);
  });

  it('place activity from location-verified posts and comments, never places of worship', async () => {
    await importOsmPlaces(db, [
      {
        type: 'node',
        id: 1,
        lat: 30.315,
        lon: -81.686,
        tags: { amenity: 'cafe', name: 'Bold Bean' },
      },
      {
        type: 'node',
        id: 2,
        lat: 30.3152,
        lon: -81.6862,
        tags: { amenity: 'place_of_worship', religion: 'christian', name: 'St Somewhere' },
      },
    ]);
    const cafe = await db.businessPlace.findFirstOrThrow({ where: { category: 'cafe' } });
    const church = await db.businessPlace.findFirstOrThrow({ where: { category: 'church' } });
    const at = local('2026-09-15', 12);
    for (const [place, by] of [
      [cafe, alice],
      [cafe, bob],
      [church, alice],
    ] as const) {
      await db.businessPost.create({
        data: { placeId: place.id, authorId: by.id, body: 'hi', createdAt: at },
      });
    }
    await db.favoritePlace.create({ data: { userId: bob.id, placeId: cafe.id, createdAt: at } });
    await runAreaStats(local('2026-09-20', 12));
    const stats = await db.placeStatsDaily.findMany();
    expect(stats).toHaveLength(1); // the church isn't counted
    expect(stats[0]).toMatchObject({
      placeId: cafe.id,
      posts: 2,
      comments: 0,
      people: 2,
      favorites: 1,
    });
  });
});

describe('the admin report (P14.6)', () => {
  it('reads the counts: people per day, unique people for a month, and hides small groups', async () => {
    const { zipReport, flowReport, parsePeriod, shown, periods } =
      await import('@/server/stats/report');
    await recordAreaVisit(alice.id, FIVE_POINTS, local('2026-09-07', 9));
    await recordAreaVisit(alice.id, FIVE_POINTS, local('2026-09-08', 18));
    await recordAreaVisit(bob.id, FIVE_POINTS, local('2026-09-08', 23));
    await recordAreaVisit(bob.id, JAX_BEACH, local('2026-09-08', 10));
    await runAreaStats(local('2026-10-02', 12));

    expect((await periods()).map((p) => p.key)).toContain('month:2026-09-01');
    const sept = parsePeriod('month:2026-09-01');
    const rows = await zipReport(sept);
    const five = rows.find((r) => r.zip === '32204')!;
    expect(five).toMatchObject({ visitorDays: 3, unique: 2, morning: 1, evening: 1, night: 1 });
    expect(five.perDay).toBeCloseTo(3 / 30);
    expect(await flowReport(sept)).toMatchObject([{ zipA: '32204', zipB: '32250', peopleDays: 1 }]);
    // Small groups never show as numbers.
    expect(shown(3)).toBe('<10');
    expect(shown(12)).toBe('12');
    expect(parsePeriod('30d')).toEqual({ kind: 'days', days: 30 });
    expect(parsePeriod('nonsense')).toEqual({ kind: 'days', days: 7 });
  });
});
