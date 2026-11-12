import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { clearVisitKeyCache, recordAreaVisit } from '@/server/stats/area-visits';
import { mapCounts, mapShapes, resetMapShapes } from '@/server/stats/map';
import { importZipAreas } from '@/server/stats/zip-areas';
import { resetDb } from './db-helpers';

// D229: the Area stats map: ZIP outlines cut to the county, counts per ZIP, nothing under 10.

const FIVE_POINTS = { latitude: 30.3149, longitude: -81.6853 }; // 32204
const JAX_BEACH = { latitude: 30.2856, longitude: -81.3884 }; // 32250
/** A moment in Jacksonville local time (EST in November: UTC−5). */
const local = (day: string, hour: number) =>
  new Date(Date.parse(`${day}T00:30:00Z`) + (hour + 5) * 3_600_000);
const NOW = local('2026-11-11', 21); // a Wednesday evening

beforeEach(async () => {
  await resetDb();
  clearVisitKeyCache();
  resetMapShapes();
  await importServiceArea(db, readBoundaryFile());
  await importZipAreas(db);
});

const people = (n: number) => Array.from({ length: n }, () => randomUUID());
const byZip = async (period: string) =>
  Object.fromEntries((await mapCounts(period, NOW)).zips.map((z) => [z.zip, z]));

describe('the ZIP map (D229)', () => {
  it('draws Duval’s ZIP areas cut to the county, without slivers from next door', async () => {
    const s = await mapShapes();
    const zips = s.zips.map((z) => z.zip);
    expect(zips).toEqual(expect.arrayContaining(['32204', '32250', '32218', '32256']));
    expect(zips).not.toContain('31562'); // Georgia
    expect(s.viewBox.split(' ').map(Number)).toHaveLength(4);
    expect(s.county).toMatch(/^M /);
    expect(s.zips.find((z) => z.zip === '32204')).toMatchObject({
      d: expect.stringMatching(/^M /),
    });
  });

  it('today counts people per ZIP live; under 10 is never sent', async () => {
    for (const id of people(12)) await recordAreaVisit(id, FIVE_POINTS, local('2026-11-11', 8));
    for (const id of people(3)) await recordAreaVisit(id, JAX_BEACH, local('2026-11-11', 9));
    const m = await mapCounts('today', NOW);
    expect(m).toMatchObject({ measure: 'people', from: '2026-11-11', to: '2026-11-11' });
    const z = await byZip('today');
    expect(z['32204']).toMatchObject({
      value: 12,
      parts: { morning: 12, afternoon: null, evening: null, night: null },
    });
    expect(z['32250']).toMatchObject({ value: null, parts: { morning: null } });
    expect(JSON.stringify(m)).not.toMatch(/"value":3\b/);
  });

  it('this week and this month count each person once, across days', async () => {
    const crowd = people(10);
    for (const day of ['2026-11-09', '2026-11-10', '2026-11-11']) {
      for (const id of crowd) await recordAreaVisit(id, FIVE_POINTS, local(day, 13));
    }
    // Last week, still this month.
    for (const id of people(5)) await recordAreaVisit(id, FIVE_POINTS, local('2026-11-03', 13));
    expect((await byZip('this-week'))['32204']).toMatchObject({ value: 10 });
    expect((await mapCounts('this-week', NOW)).from).toBe('2026-11-09'); // Monday
    expect((await byZip('this-month'))['32204']).toMatchObject({ value: 15 });
    expect((await byZip('today'))['32204']).toMatchObject({ value: 10, parts: { afternoon: 10 } });
  });

  it('a finished week shows unique people; rolling ranges add up each day', async () => {
    await db.areaStatsDaily.createMany({
      data: ['2026-11-02', '2026-11-03'].map((d) => ({
        day: new Date(`${d}T00:00:00Z`),
        zip: '32204',
        visitors: 12,
        morning: 12,
        afternoon: 0,
        evening: 0,
        night: 0,
        newThisMonth: 0,
      })),
    });
    await db.areaStatsWeekly.create({
      data: { weekStart: new Date('2026-11-02T00:00:00Z'), zip: '32204', visitors: 15 },
    });
    const week = await mapCounts('week:2026-11-02', NOW);
    expect(week).toMatchObject({ measure: 'people', partsMeasure: 'visits' });
    expect(week.zips.find((z) => z.zip === '32204')).toMatchObject({
      value: 15,
      parts: { morning: 24 },
    });
    const last7 = await mapCounts('7d', NOW);
    expect(last7).toMatchObject({ measure: 'visits', from: '2026-11-04', to: '2026-11-10' });
    const last30 = await mapCounts('30d', NOW);
    expect(last30.zips.find((z) => z.zip === '32204')).toMatchObject({ value: 24 });
  });
});
