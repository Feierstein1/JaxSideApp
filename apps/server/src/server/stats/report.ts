import { db } from '../db';
import { nearestNeighborhood } from '../location/neighborhood';
import { localDayHour } from './area-visits';

/**
 * P14.6 (D116): the admin portal's area statistics. Everything here reads the count tables
 * only (never the per-person scratch rows). Groups under MIN_GROUP people are shown as "<10".
 */
export const MIN_GROUP = 10;

export type Range =
  | { kind: 'days'; days: 7 | 30 }
  | { kind: 'week'; start: string }
  | { kind: 'month'; start: string };

export interface Period {
  key: string;
  label: string;
  range: Range;
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** First and last day (inclusive) of a range, local days. */
export function bounds(range: Range, now = new Date()): { from: string; to: string; days: number } {
  if (range.kind === 'days') {
    const yesterday = addDays(localDayHour(now).day, -1);
    return { from: addDays(yesterday, -(range.days - 1)), to: yesterday, days: range.days };
  }
  if (range.kind === 'week') return { from: range.start, to: addDays(range.start, 6), days: 7 };
  const start = new Date(`${range.start}T00:00:00Z`);
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const days = Math.round((next.getTime() - start.getTime()) / 86_400_000);
  return { from: range.start, to: addDays(range.start, days - 1), days };
}

/** The choices for the period menu: rolling ranges, then counted months and weeks. */
export async function periods(): Promise<Period[]> {
  const [months, weeks] = await Promise.all([
    db.$queryRaw<
      { m: Date }[]
    >`SELECT DISTINCT month AS m FROM "AreaStatsMonthly" ORDER BY 1 DESC LIMIT 12`,
    db.$queryRaw<
      { w: Date }[]
    >`SELECT DISTINCT "weekStart" AS w FROM "AreaStatsWeekly" ORDER BY 1 DESC LIMIT 12`,
  ]);
  return [
    { key: '7d', label: 'Last 7 days', range: { kind: 'days', days: 7 } },
    { key: '30d', label: 'Last 30 days', range: { kind: 'days', days: 30 } },
    ...months.map((r) => ({
      key: `month:${iso(r.m)}`,
      label: r.m.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      range: { kind: 'month' as const, start: iso(r.m) },
    })),
    ...weeks.map((r) => ({
      key: `week:${iso(r.w)}`,
      label: `Week of ${r.w.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`,
      range: { kind: 'week' as const, start: iso(r.w) },
    })),
  ];
}

/** A count for display: "<10" under the minimum group size. */
export const shown = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n < MIN_GROUP ? `<${MIN_GROUP}` : n.toLocaleString('en-US');

export interface ZipRow {
  zip: string;
  area: string | null;
  /** People per day, added up over the range. */
  visitorDays: number;
  perDay: number;
  /** Distinct people over the whole week or month (null for rolling ranges). */
  unique: number | null;
  morning: number;
  afternoon: number;
  evening: number;
  night: number;
  weekdayAvg: number;
  weekendAvg: number;
  newThisMonth: number;
}

let areaNames: Map<string, string | null> | null = null;
/** A neighborhood name for each ZIP (from its center), for readability. */
async function zipAreaNames() {
  if (areaNames) return areaNames;
  const rows = await db.$queryRaw<{ zip: string; latitude: number; longitude: number }[]>`
    SELECT zip, ST_Y(ST_Centroid(geom::geometry)) AS latitude, ST_X(ST_Centroid(geom::geometry)) AS longitude
    FROM "ZipArea"`;
  areaNames = new Map(rows.map((r) => [r.zip, nearestNeighborhood(r)]));
  return areaNames;
}

export async function zipReport(range: Range, now = new Date()): Promise<ZipRow[]> {
  const { from, to, days } = bounds(range, now);
  const rows = await db.$queryRaw<
    {
      zip: string;
      visitor_days: number;
      morning: number;
      afternoon: number;
      evening: number;
      night: number;
      new_month: number;
      weekday: number;
      weekend: number;
      weekday_n: number;
      weekend_n: number;
    }[]
  >`
    SELECT zip, sum(visitors)::int AS visitor_days,
           sum(morning)::int AS morning, sum(afternoon)::int AS afternoon,
           sum(evening)::int AS evening, sum(night)::int AS night,
           sum("newThisMonth")::int AS new_month,
           coalesce(sum(visitors) FILTER (WHERE extract(isodow FROM day) < 6), 0)::int AS weekday,
           coalesce(sum(visitors) FILTER (WHERE extract(isodow FROM day) >= 6), 0)::int AS weekend,
           0 AS weekday_n, 0 AS weekend_n
    FROM "AreaStatsDaily"
    WHERE day BETWEEN ${from}::date AND ${to}::date
    GROUP BY zip`;
  // How many weekdays / weekend days the range has (for the averages).
  let weekdays = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (new Date(`${d}T00:00:00Z`).getUTCDay() % 6 !== 0) weekdays++;
  }
  const weekendDays = days - weekdays;
  const unique =
    range.kind === 'week'
      ? await db.areaStatsWeekly.findMany({
          where: { weekStart: new Date(`${range.start}T00:00:00Z`) },
        })
      : range.kind === 'month'
        ? await db.areaStatsMonthly.findMany({
            where: { month: new Date(`${range.start}T00:00:00Z`) },
          })
        : [];
  const uniqueBy = new Map(unique.map((u) => [u.zip, u.visitors]));
  const names = await zipAreaNames();
  return rows.map((r) => ({
    zip: r.zip,
    area: names.get(r.zip) ?? null,
    visitorDays: r.visitor_days,
    perDay: r.visitor_days / days,
    unique: range.kind === 'days' ? null : (uniqueBy.get(r.zip) ?? 0),
    morning: r.morning,
    afternoon: r.afternoon,
    evening: r.evening,
    night: r.night,
    weekdayAvg: weekdays ? r.weekday / weekdays : 0,
    weekendAvg: weekendDays ? r.weekend / weekendDays : 0,
    newThisMonth: r.new_month,
  }));
}

export interface ZipDay {
  day: string;
  visitors: number;
  morning: number;
  afternoon: number;
  evening: number;
  night: number;
  newThisMonth: number;
}

export async function zipDays(zip: string, range: Range, now = new Date()): Promise<ZipDay[]> {
  const { from, to } = bounds(range, now);
  const rows = await db.areaStatsDaily.findMany({
    where: { zip, day: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
    orderBy: { day: 'asc' },
  });
  return rows.map((r) => ({ ...r, day: iso(r.day) }));
}

export interface PlaceRow {
  id: string;
  name: string;
  category: string;
  posts: number;
  comments: number;
  peopleDays: number;
  favorites: number;
  votes: number;
}

export async function placeReport(range: Range, now = new Date()): Promise<PlaceRow[]> {
  const { from, to } = bounds(range, now);
  return db.$queryRaw<PlaceRow[]>`
    SELECT p.id, p.name, p.category,
           sum(s.posts)::int AS posts, sum(s.comments)::int AS comments,
           sum(s.people)::int AS "peopleDays", sum(s.favorites)::int AS favorites,
           sum(s.votes)::int AS votes
    FROM "PlaceStatsDaily" s JOIN "BusinessPlace" p ON p.id = s."placeId"
    WHERE s.day BETWEEN ${from}::date AND ${to}::date
    GROUP BY p.id, p.name, p.category
    ORDER BY sum(s.posts + s.comments) DESC, p.name
    LIMIT 200`;
}

export interface FlowRow {
  zipA: string;
  zipB: string;
  areaA: string | null;
  areaB: string | null;
  peopleDays: number;
}

export async function flowReport(range: Range, now = new Date()): Promise<FlowRow[]> {
  const { from, to } = bounds(range, now);
  const rows = await db.$queryRaw<{ zipA: string; zipB: string; n: number }[]>`
    SELECT "zipA", "zipB", sum(visitors)::int AS n FROM "AreaFlowDaily"
    WHERE day BETWEEN ${from}::date AND ${to}::date
    GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 100`;
  const names = await zipAreaNames();
  return rows.map((r) => ({
    zipA: r.zipA,
    zipB: r.zipB,
    areaA: names.get(r.zipA) ?? null,
    areaB: names.get(r.zipB) ?? null,
    peopleDays: r.n,
  }));
}

/** For the page: parse "?period=" into a range (defaults to the last 7 days). */
export function parsePeriod(key: string | undefined): Range {
  const m = /^(week|month):(\d{4}-\d{2}-\d{2})$/.exec(key ?? '');
  if (m) return { kind: m[1] as 'week' | 'month', start: m[2]! };
  return { kind: 'days', days: key === '30d' ? 30 : 7 };
}

/** Sorting helper for the tables. */
export function sortRows<T>(rows: T[], key: keyof T, dir: 'asc' | 'desc'): T[] {
  const f = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * f;
    return String(x ?? '').localeCompare(String(y ?? '')) * f;
  });
}
