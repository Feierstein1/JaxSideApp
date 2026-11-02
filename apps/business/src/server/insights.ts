import { CATEGORY_GROUPS } from '@jax/shared';
import type { BusinessAccount } from '@/generated/prisma/client';
import { db } from './db';
import { ApiError } from './http';
import { requirePlace } from './places';
import { currentPlan } from './plan';

/**
 * B2.1 (D116, D165, Q29): counts for a place's Owner. Read only from the count tables the
 * app's nightly job fills (never per-person rows, never who): people in the place's ZIP
 * area per day, part of the day, weekday / weekend, first time this month, distinct people
 * per week and month, the ZIP areas the same people also visited, and the place's own
 * discussion activity. Any group under 10 is never shown (null). Only with a plan that
 * includes insights; never for places of worship.
 */

export const MIN_GROUP = 10;
const TZ = 'America/New_York';
const FAITH: readonly string[] = CATEGORY_GROUPS.find((g) => g.key === 'faith')?.categories ?? [];

export type InsightsPeriod = '7d' | '30d';

/** A count, or null when it's too small to show (fewer than 10). */
const shown = (n: number | null | undefined): number | null =>
  n === null || n === undefined || n < MIN_GROUP ? null : n;

/**
 * An average per day, or null when it's under 10: an average of 5 a day would reveal daily
 * groups smaller than 10 even when the total is larger.
 */
const avg = (total: number, over: number) => {
  if (over === 0) return null;
  const a = Math.round((total / over) * 10) / 10;
  return a < MIN_GROUP ? null : a;
};

const localDay = (at: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The last full days (yesterday and before, Jacksonville time). */
export function periodBounds(period: InsightsPeriod, now: Date) {
  const days = period === '30d' ? 30 : 7;
  const to = addDays(localDay(now), -1);
  return { from: addDays(to, -(days - 1)), to, days };
}

/** 🔒 Owner only, with a plan that includes insights, and not a place of worship. */
async function insightsPlace(account: BusinessAccount, placeId: string, now: Date) {
  const place = await requirePlace(account.id, placeId, 'insights');
  const row = await db.businessPlace.findUniqueOrThrow({
    where: { id: placeId },
    select: { category: true },
  });
  if (FAITH.includes(row.category)) {
    throw new ApiError(403, 'NOT_AVAILABLE', 'Counts aren’t available for places of worship.');
  }
  const plan = await currentPlan(account, now);
  if (!plan?.includesInsights) {
    throw new ApiError(403, 'PLAN', 'Area counts come with plans that include them.');
  }
  return place;
}

export async function placeInsights(
  account: BusinessAccount,
  placeId: string,
  period: InsightsPeriod,
  now = new Date(),
) {
  const place = await insightsPlace(account, placeId, now);
  const { from, to, days } = periodBounds(period, now);

  const [zipRow] = await db.$queryRaw<{ zip: string }[]>`
    SELECT z.zip FROM "ZipArea" z JOIN "BusinessPlace" p ON p.id = ${placeId}::uuid
    WHERE ST_Covers(z.geom, p.location) LIMIT 1`;
  const zip = zipRow?.zip ?? null;

  let area = null;
  if (zip) {
    const [r] = await db.$queryRaw<
      {
        visitors: number | null;
        morning: number | null;
        afternoon: number | null;
        evening: number | null;
        night: number | null;
        new_month: number | null;
        weekday: number | null;
        weekend: number | null;
      }[]
    >`
      SELECT sum(visitors)::int AS visitors, sum(morning)::int AS morning,
             sum(afternoon)::int AS afternoon, sum(evening)::int AS evening,
             sum(night)::int AS night, sum("newThisMonth")::int AS new_month,
             sum(visitors) FILTER (WHERE extract(isodow FROM day) < 6)::int AS weekday,
             sum(visitors) FILTER (WHERE extract(isodow FROM day) >= 6)::int AS weekend
      FROM "AreaStatsDaily" WHERE zip = ${zip} AND day BETWEEN ${from}::date AND ${to}::date`;
    let weekdays = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (new Date(`${d}T00:00:00Z`).getUTCDay() % 6 !== 0) weekdays++;
    }
    const [week, month] = await Promise.all([
      db.areaStatsWeekly.findFirst({ where: { zip }, orderBy: { weekStart: 'desc' } }),
      db.areaStatsMonthly.findFirst({ where: { zip }, orderBy: { month: 'desc' } }),
    ]);
    const flows = await db.$queryRaw<{ other: string; n: number }[]>`
      SELECT CASE WHEN "zipA" = ${zip} THEN "zipB" ELSE "zipA" END AS other, sum(visitors)::int AS n
      FROM "AreaFlowDaily"
      WHERE (${zip} IN ("zipA", "zipB")) AND day BETWEEN ${from}::date AND ${to}::date
      GROUP BY 1 HAVING sum(visitors) >= ${MIN_GROUP} ORDER BY 2 DESC LIMIT 5`;
    const total = r?.visitors ?? 0;
    area = {
      zip,
      peopleDays: shown(total),
      perDay: avg(total, days),
      weekdayAvg: avg(r?.weekday ?? 0, weekdays),
      weekendAvg: avg(r?.weekend ?? 0, days - weekdays),
      partOfDay: {
        morning: shown(r?.morning),
        afternoon: shown(r?.afternoon),
        evening: shown(r?.evening),
        night: shown(r?.night),
      },
      newThisMonth: shown(r?.new_month),
      lastWeek: week
        ? { start: week.weekStart.toISOString().slice(0, 10), people: shown(week.visitors) }
        : null,
      lastMonth: month
        ? {
            start: month.month.toISOString().slice(0, 10),
            people: shown(month.visitors),
            avgDays:
              month.visitors >= MIN_GROUP
                ? Math.round((month.visitDays / month.visitors) * 10) / 10
                : null,
          }
        : null,
      alsoVisited: flows.map((f) => ({ zip: f.other, peopleDays: f.n })),
    };
  }

  const [p] = await db.$queryRaw<
    {
      posts: number | null;
      comments: number | null;
      people: number | null;
      favorites: number | null;
      votes: number | null;
    }[]
  >`
    SELECT sum(posts)::int AS posts, sum(comments)::int AS comments, sum(people)::int AS people,
           sum(favorites)::int AS favorites, sum(votes)::int AS votes
    FROM "PlaceStatsDaily" WHERE "placeId" = ${placeId}::uuid AND day BETWEEN ${from}::date AND ${to}::date`;

  return {
    place: { id: place.id, name: place.name },
    period: { key: period, from, to, days },
    minGroup: MIN_GROUP,
    area,
    activity: {
      posts: shown(p?.posts),
      comments: shown(p?.comments),
      peopleDays: shown(p?.people),
      favorites: shown(p?.favorites),
      votes: shown(p?.votes),
    },
  };
}

export type PlaceInsights = Awaited<ReturnType<typeof placeInsights>>;
