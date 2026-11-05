import { beforeEach, describe, expect, it } from 'vitest';
import { adOverview, getAdStats, listAdsWithStats } from '@/server/admin/ad-stats';
import { ADMIN_PAGE_SIZE, pageNumber, slicePage } from '@/server/admin/paging';
import { listCases } from '@/server/admin/queue';
import { statsDay } from '@/server/ads/serve';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { createTestUser } from './user-factory';

// D210: ad results for admins (from the daily totals, never who saw an ad), and 20-row pages.

const DAY = 86_400_000;
const NOW = new Date('2026-11-05T17:00:00Z');
let cafe: string;
let owner: { id: string };

const ad = (headline: string, status: 'APPROVED' | 'PAUSED' | 'ENDED', approvedAt = NOW) =>
  db.ad.create({
    data: {
      accountId: owner.id,
      placeId: cafe,
      template: 'BANNER',
      headline,
      cityWide: true,
      status,
      approvedAt,
    },
  });
const day = (daysAgo: number) => new Date(statsDay(NOW).getTime() - daysAgo * DAY);

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
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
});

describe('ad results (D210)', () => {
  it('totals views and answers for 30 days and all time, live and past apart', async () => {
    const live = await ad('Half-price lattes', 'APPROVED');
    const ended = await ad('Summer special', 'ENDED');
    await db.adDailyStats.createMany({
      data: [
        { adId: live.id, day: day(0), views: 40, interested: 6, notInterested: 2 },
        { adId: live.id, day: day(3), views: 60, interested: 3, notInterested: 1 },
        { adId: live.id, day: day(45), views: 500, interested: 10, notInterested: 30 },
        { adId: ended.id, day: day(2), views: 7, interested: 0, notInterested: 1 },
      ],
    });

    const lives = await listAdsWithStats('live', 1, NOW);
    expect(lives).toMatchObject({ total: 1, page: 1, pages: 1 });
    expect(lives.rows[0]).toMatchObject({
      id: live.id,
      place: { name: 'Bold Bean' },
      reach: 'City-wide',
      last30Days: { views: 100, interested: 9, notInterested: 3 },
      allTime: { views: 600, interested: 19, notInterested: 33 },
    });
    expect((await listAdsWithStats('past', 1, NOW)).rows.map((a) => a.id)).toEqual([ended.id]);

    expect(await adOverview(NOW)).toEqual({
      live: 1,
      waiting: 0,
      viewsToday: 40,
      last30Days: { views: 107, interested: 9, notInterested: 4 },
    });

    const one = await getAdStats(live.id, 1, NOW);
    expect(one.days.rows.map((d) => d.views)).toEqual([40, 60, 500]);
    expect(one.days).toMatchObject({ total: 3, pages: 1 });
    expect(one.allTime.views).toBe(600);
    // Only totals: nothing about who saw it.
    expect(JSON.stringify(one)).not.toMatch(/viewer|userId/);
  });

  it('pages the day-by-day list and the ad lists 20 at a time', async () => {
    const live = await ad('Daily deal', 'APPROVED');
    await db.adDailyStats.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({ adId: live.id, day: day(i), views: i + 1 })),
    });
    const first = await getAdStats(live.id, 1, NOW);
    const second = await getAdStats(live.id, 2, NOW);
    expect(first.days.rows).toHaveLength(20);
    expect(second.days.rows.map((d) => d.views)).toEqual([21, 22, 23, 24, 25]);
    expect(second.days).toMatchObject({ page: 2, pages: 2, total: 25 });

    for (let i = 0; i < 21; i++) {
      await ad(`Ad ${i}`, 'APPROVED', new Date(NOW.getTime() - (i + 1) * 60_000));
    }
    const p1 = await listAdsWithStats('live', 1, NOW);
    const p2 = await listAdsWithStats('live', 2, NOW);
    expect(p1.rows).toHaveLength(ADMIN_PAGE_SIZE);
    expect(p2.rows).toHaveLength(2);
    expect(new Set([...p1.rows, ...p2.rows].map((a) => a.id)).size).toBe(22);
  });

  it('404s an unknown ad', async () => {
    await expect(getAdStats('00000000-0000-7000-8000-000000000000', 1, NOW)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('admin pages (D210)', () => {
  it('reads page numbers safely and slices in-memory lists', () => {
    expect([pageNumber('3'), pageNumber('0'), pageNumber('x'), pageNumber('99999')]).toEqual([
      3, 1, 1, 1,
    ]);
    const p = slicePage(
      Array.from({ length: 45 }, (_, i) => i),
      3,
    );
    expect(p).toMatchObject({ rows: [40, 41, 42, 43, 44], total: 45, page: 3, pages: 3 });
  });

  it('the report queue loads one page of cases, most reported first', async () => {
    const reporter = await createTestUser('rep_pg');
    const people = await Promise.all(
      Array.from({ length: 23 }, (_, i) => createTestUser(`target_pg${i}`)),
    );
    for (const [i, p] of people.entries()) {
      for (let n = 0; n <= i % 3; n++) {
        await db.report.create({
          data: { reporterUserId: reporter.id, reportedUserId: p.id, reason: 'SPAM' },
        });
      }
    }
    const one = await listCases({ page: 1 });
    const two = await listCases({ page: 2 });
    expect(one).toMatchObject({ total: 23, pages: 2 });
    expect(one.rows).toHaveLength(20);
    expect(two.rows).toHaveLength(3);
    expect(one.rows[0]!.reportCount).toBe(3);
    expect(two.rows.every((c) => c.reportCount === 1)).toBe(true);
    expect(new Set([...one.rows, ...two.rows].map((c) => c.id)).size).toBe(23);
  });
});
