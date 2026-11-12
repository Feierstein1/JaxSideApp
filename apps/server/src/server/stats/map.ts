import { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { nearestNeighborhood } from '../location/neighborhood';
import { localDayHour, weekStart } from './area-visits';
import { bounds, MIN_GROUP, parsePeriod } from './report';

/**
 * D229: the Area stats map. Each ZIP code area, cut to the county outline, shaded by how many
 * people used JaxSide there in a period. Counts only (D116); any number under MIN_GROUP is
 * replaced by null here, so a small group never reaches the browser.
 *
 * Today, this week and this month aren't counted yet (the nightly job counts finished days,
 * weeks and months), so those three count distinct codes in the current per-person rows;
 * like the nightly job, only totals per ZIP leave the database.
 */

/** Live periods, for the map only (the tables keep reading finished counts). */
export const LIVE_PERIODS = [
  { key: 'today', label: 'Today (so far)' },
  { key: 'this-week', label: 'This week (so far)' },
  { key: 'this-month', label: 'This month (so far)' },
] as const;
export type LiveKey = (typeof LIVE_PERIODS)[number]['key'];
export const isLive = (key: string): key is LiveKey => LIVE_PERIODS.some((p) => p.key === key);

/** Longitude is squeezed by cos(latitude) so Jacksonville isn't stretched sideways. */
const X_SCALE = Math.cos((30.33 * Math.PI) / 180);
/** About 40 m: plenty for a map the width of a page, and keeps the outlines small. */
const SIMPLIFY = 0.0004;

export interface ZipShape {
  zip: string;
  area: string | null;
  /** SVG path in the map's own units (scaled degrees, y down). */
  d: string;
}
export interface MapShapes {
  viewBox: string;
  county: string;
  zips: ZipShape[];
}

let shapes: MapShapes | null = null;

/** The outlines (computed once per server process; they never change). */
export async function mapShapes(): Promise<MapShapes> {
  if (shapes) return shapes;
  const [county] = await db.$queryRaw<
    { d: string | null; minx: number; miny: number; maxx: number; maxy: number }[]
  >`
    WITH c AS (
      SELECT ST_Scale(ST_Union(geom::geometry), ${X_SCALE}, 1) AS g
      FROM "ServiceArea" WHERE active
    )
    SELECT ST_AsSVG(ST_SimplifyPreserveTopology(g, ${SIMPLIFY}), 0, 4) AS d,
           ST_XMin(g) AS minx, ST_YMin(g) AS miny, ST_XMax(g) AS maxx, ST_YMax(g) AS maxy
    FROM c`;
  const rows = await db.$queryRaw<{ zip: string; d: string; lat: number; lon: number }[]>`
    WITH c AS (SELECT ST_Union(geom::geometry) AS g FROM "ServiceArea" WHERE active),
    z AS (
      SELECT a.zip, ST_Intersection(a.geom::geometry, c.g) AS g
      FROM "ZipArea" a, c WHERE ST_Intersects(a.geom::geometry, c.g)
    )
    SELECT zip,
           ST_AsSVG(ST_Scale(ST_SimplifyPreserveTopology(g, ${SIMPLIFY}), ${X_SCALE}, 1), 0, 4) AS d,
           ST_Y(ST_PointOnSurface(g)) AS lat, ST_X(ST_PointOnSurface(g)) AS lon
    FROM z
    -- Leave out slivers where a neighboring county's ZIP only grazes the line.
    WHERE ST_Area(g) > 0.00002
    ORDER BY zip`;
  if (!county?.d) {
    // Not loaded yet (fresh database): don't cache, try again next time.
    return { viewBox: '0 0 1 1', county: '', zips: [] };
  }
  const pad = 0.01;
  // ST_AsSVG flips y (north up), so the box starts at -maxy.
  shapes = {
    viewBox: [
      county.minx - pad,
      -county.maxy - pad,
      county.maxx - county.minx + 2 * pad,
      county.maxy - county.miny + 2 * pad,
    ]
      .map((n) => n.toFixed(4))
      .join(' '),
    county: county.d,
    zips: rows.map((r) => ({
      zip: r.zip,
      d: r.d,
      area: nearestNeighborhood({ latitude: r.lat, longitude: r.lon }),
    })),
  };
  return shapes;
}

/** Tests only. */
export function resetMapShapes() {
  shapes = null;
}

export interface ZipCount {
  zip: string;
  /** People (or visits, see `measure`); null when under MIN_GROUP. */
  value: number | null;
  /** By part of the day; each null when under MIN_GROUP. */
  parts: {
    morning: number | null;
    afternoon: number | null;
    evening: number | null;
    night: number | null;
  };
}
export interface MapCounts {
  /** "people": each person once in the period; "visits": each day's people, added up. */
  measure: 'people' | 'visits';
  /** What the parts of the day count (a finished week or month splits days, not people). */
  partsMeasure: 'people' | 'visits';
  from: string;
  to: string;
  zips: ZipCount[];
}

type Raw = {
  zip: string;
  n: number;
  morning: number;
  afternoon: number;
  evening: number;
  night: number;
};
const hide = (n: number) => (n < MIN_GROUP ? null : n);
const finish = (rows: Raw[]): ZipCount[] =>
  rows.map((r) => ({
    zip: r.zip,
    value: hide(r.n),
    parts: {
      morning: hide(r.morning),
      afternoon: hide(r.afternoon),
      evening: hide(r.evening),
      night: hide(r.night),
    },
  }));

/** Distinct people per ZIP since `from` (today, this week or this month so far). */
function live(code: 'visitorWeek' | 'visitorMonth' | null, from: string, to: string) {
  // Today: one row per person, ZIP and day, so rows are people.
  const who = code ? Prisma.sql`DISTINCT ${Prisma.raw(`"${code}"`)}` : Prisma.sql`*`;
  return db.$queryRaw<Raw[]>`
    SELECT zip,
           count(${who})::int AS n,
           count(${who}) FILTER (WHERE dayparts & 1 <> 0)::int AS morning,
           count(${who}) FILTER (WHERE dayparts & 2 <> 0)::int AS afternoon,
           count(${who}) FILTER (WHERE dayparts & 4 <> 0)::int AS evening,
           count(${who}) FILTER (WHERE dayparts & 8 <> 0)::int AS night
    FROM "AreaVisit"
    WHERE day BETWEEN ${from}::date AND ${to}::date
    GROUP BY zip`;
}

/** Counts per ZIP for the map's period (a live key, or one of the Area stats periods). */
export async function mapCounts(period: string, now = new Date()): Promise<MapCounts> {
  const today = localDayHour(now).day;
  if (isLive(period)) {
    const from =
      period === 'today'
        ? today
        : period === 'this-week'
          ? weekStart(today)
          : `${today.slice(0, 7)}-01`;
    const code =
      period === 'today' ? null : period === 'this-week' ? 'visitorWeek' : 'visitorMonth';
    return {
      measure: 'people',
      partsMeasure: 'people',
      from,
      to: today,
      zips: finish(await live(code, from, today)),
    };
  }
  const range = parsePeriod(period);
  const { from, to } = bounds(range, now);
  const daily = await db.$queryRaw<Raw[]>`
    SELECT zip, sum(visitors)::int AS n, sum(morning)::int AS morning,
           sum(afternoon)::int AS afternoon, sum(evening)::int AS evening, sum(night)::int AS night
    FROM "AreaStatsDaily" WHERE day BETWEEN ${from}::date AND ${to}::date
    GROUP BY zip`;
  if (range.kind === 'days') {
    return { measure: 'visits', partsMeasure: 'visits', from, to, zips: finish(daily) };
  }
  // A finished week or month: each person once (counted the night it ended); the parts of the
  // day stay day-by-day totals.
  const unique =
    range.kind === 'week'
      ? await db.areaStatsWeekly.findMany({ where: { weekStart: new Date(`${from}T00:00:00Z`) } })
      : await db.areaStatsMonthly.findMany({ where: { month: new Date(`${from}T00:00:00Z`) } });
  const people = new Map(unique.map((u) => [u.zip, u.visitors]));
  const zips = [...new Set([...people.keys(), ...daily.map((d) => d.zip)])];
  const byZip = new Map(daily.map((d) => [d.zip, d]));
  return {
    measure: 'people',
    partsMeasure: 'visits',
    from,
    to,
    zips: finish(
      zips.map((zip) => ({
        morning: 0,
        afternoon: 0,
        evening: 0,
        night: 0,
        ...byZip.get(zip),
        zip,
        n: people.get(zip) ?? 0,
      })),
    ),
  };
}
