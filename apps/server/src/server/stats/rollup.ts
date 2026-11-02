import { CATEGORY_GROUPS } from '@jax/shared';
import { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { deleteInBatches } from '../jobs/batch';
import { clearVisitKeyCache, localDayHour, weekStart } from './area-visits';

/**
 * D116: the nightly counting (run by the daily maintenance job). For every finished local day:
 * distinct people per ZIP and per part of the day, people new to that ZIP this month, ZIP pairs
 * visited the same day, and activity at each place (not places of worship). For every finished
 * week and month: distinct people per ZIP. Then the period's secret key is destroyed and the
 * per-person rows that are no longer needed are deleted. Each period is counted once.
 */

const TZ = 'America/New_York';
/** How far back a first run (or a run after a long stop) catches up. */
const CATCH_UP_DAYS = 40;
const FAITH = (CATEGORY_GROUPS.find((g) => g.key === 'faith')?.categories ??
  []) as readonly string[];

export interface AreaStatsReport {
  daysCounted: number;
  weeksCounted: number;
  monthsCounted: number;
  visitRowsDeleted: number;
  keysDestroyed: number;
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function counted(kind: 'day' | 'week' | 'month', period: string) {
  const row = await db.statsRollup.findUnique({
    where: { kind_period: { kind, period: new Date(`${period}T00:00:00Z`) } },
  });
  return !!row;
}
const markCounted = (kind: 'day' | 'week' | 'month', period: string) =>
  db.statsRollup.create({ data: { kind, period: new Date(`${period}T00:00:00Z`) } });

async function countDay(day: string) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "AreaStatsDaily" (day, zip, visitors, morning, afternoon, evening, night, "newThisMonth")
      SELECT v.day, v.zip, count(*),
             count(*) FILTER (WHERE v.dayparts & 1 > 0), count(*) FILTER (WHERE v.dayparts & 2 > 0),
             count(*) FILTER (WHERE v.dayparts & 4 > 0), count(*) FILTER (WHERE v.dayparts & 8 > 0),
             count(*) FILTER (WHERE NOT EXISTS (
               SELECT 1 FROM "AreaVisit" e
               WHERE e.zip = v.zip AND e."visitorMonth" = v."visitorMonth" AND e.day < v.day
                 AND date_trunc('month', e.day) = date_trunc('month', v.day)))
      FROM "AreaVisit" v WHERE v.day = ${day}::date
      GROUP BY v.day, v.zip
      ON CONFLICT DO NOTHING`;
    await tx.$executeRaw`
      INSERT INTO "AreaFlowDaily" (day, "zipA", "zipB", visitors)
      SELECT a.day, a.zip, b.zip, count(*)
      FROM "AreaVisit" a
      JOIN "AreaVisit" b ON b.day = a.day AND b."visitorMonth" = a."visitorMonth" AND a.zip < b.zip
      WHERE a.day = ${day}::date
      GROUP BY a.day, a.zip, b.zip
      ON CONFLICT DO NOTHING`;
    // Place activity: posts and comments in a place's discussion need you within 528 yd of
    // it (location-verified), plus new favorites and votes. Never places of worship.
    await tx.$executeRaw`
      WITH r AS (SELECT (${day}::date)::timestamp AT TIME ZONE ${TZ} AS lo,
                        (${day}::date + 1)::timestamp AT TIME ZONE ${TZ} AS hi),
      acts AS (
        SELECT p."placeId", 'post' AS kind, p."authorId" AS person
        FROM "BusinessPost" p, r WHERE p."createdAt" >= r.lo AND p."createdAt" < r.hi
          AND p."authorId" IS NOT NULL -- D172: the business's own posts aren't community activity
        UNION ALL
        SELECT bp."placeId", 'comment', c."authorUserId"
        FROM "Comment" c JOIN "BusinessPost" bp ON bp.id = c."businessPostId", r
        WHERE c."createdAt" >= r.lo AND c."createdAt" < r.hi AND c."authorKind" <> 'BUSINESS'),
      fav AS (SELECT f."placeId", count(*)::int AS n FROM "FavoritePlace" f, r
              WHERE f."createdAt" >= r.lo AND f."createdAt" < r.hi GROUP BY 1),
      vot AS (SELECT bp."placeId", count(*)::int AS n
              FROM "Vote" v JOIN "BusinessPost" bp ON bp.id = v."businessPostId", r
              WHERE v."createdAt" >= r.lo AND v."createdAt" < r.hi GROUP BY 1),
      ids AS (SELECT "placeId" FROM acts UNION SELECT "placeId" FROM fav UNION SELECT "placeId" FROM vot)
      INSERT INTO "PlaceStatsDaily" (day, "placeId", posts, comments, people, favorites, votes)
      SELECT ${day}::date, i."placeId",
             (SELECT count(*) FROM acts a WHERE a."placeId" = i."placeId" AND a.kind = 'post'),
             (SELECT count(*) FROM acts a WHERE a."placeId" = i."placeId" AND a.kind = 'comment'),
             (SELECT count(DISTINCT a.person) FROM acts a WHERE a."placeId" = i."placeId"),
             coalesce(f.n, 0), coalesce(v.n, 0)
      FROM ids i
      JOIN "BusinessPlace" pl ON pl.id = i."placeId"
      LEFT JOIN fav f ON f."placeId" = i."placeId"
      LEFT JOIN vot v ON v."placeId" = i."placeId"
      WHERE pl.category NOT IN (${Prisma.join(FAITH.length ? FAITH : ['-'])})
      ON CONFLICT DO NOTHING`;
    await tx.statsRollup.create({
      data: { kind: 'day', period: new Date(`${day}T00:00:00Z`) },
    });
  });
}

export async function runAreaStats(now = new Date()): Promise<AreaStatsReport> {
  const today = localDayHour(now).day;
  const thisWeek = weekStart(today);
  const thisMonth = `${today.slice(0, 7)}-01`;
  const report: AreaStatsReport = {
    daysCounted: 0,
    weeksCounted: 0,
    monthsCounted: 0,
    visitRowsDeleted: 0,
    keysDestroyed: 0,
  };

  // 1. Finished days not counted yet (catching up at most CATCH_UP_DAYS).
  for (let day = addDays(today, -CATCH_UP_DAYS); day < today; day = addDays(day, 1)) {
    if (await counted('day', day)) continue;
    await countDay(day);
    report.daysCounted++;
  }

  // 2. Finished weeks and months that still have rows: distinct people per ZIP.
  const weeks = await db.$queryRaw<{ w: Date }[]>`
    SELECT DISTINCT (day - (extract(isodow FROM day)::int - 1))::date AS w
    FROM "AreaVisit" WHERE day < ${thisWeek}::date`;
  for (const { w } of weeks) {
    const week = w.toISOString().slice(0, 10);
    if (await counted('week', week)) continue;
    await db.$executeRaw`
      INSERT INTO "AreaStatsWeekly" ("weekStart", zip, visitors)
      SELECT ${week}::date, zip, count(DISTINCT "visitorWeek") FROM "AreaVisit"
      WHERE day >= ${week}::date AND day < ${week}::date + 7 GROUP BY zip
      ON CONFLICT DO NOTHING`;
    await markCounted('week', week);
    report.weeksCounted++;
  }
  const months = await db.$queryRaw<{ m: Date }[]>`
    SELECT DISTINCT date_trunc('month', day)::date AS m FROM "AreaVisit" WHERE day < ${thisMonth}::date`;
  for (const { m } of months) {
    const month = m.toISOString().slice(0, 10);
    if (await counted('month', month)) continue;
    await db.$executeRaw`
      INSERT INTO "AreaStatsMonthly" (month, zip, visitors, "visitDays")
      SELECT ${month}::date, zip, count(DISTINCT "visitorMonth"), count(*) FROM "AreaVisit"
      WHERE day >= ${month}::date AND day < (${month}::date + interval '1 month')::date GROUP BY zip
      ON CONFLICT DO NOTHING`;
    await markCounted('month', month);
    report.monthsCounted++;
  }

  // 3. Destroy the keys of finished periods: after this, their codes can't be linked to anyone.
  const gone = await db.$executeRaw`
    DELETE FROM "VisitKey"
    WHERE (period LIKE 'week:%' AND substring(period FROM 6)::date < ${thisWeek}::date)
       OR (period LIKE 'month:%' AND (substring(period FROM 7) || '-01')::date < ${thisMonth}::date)`;
  report.keysDestroyed = gone;
  if (gone) clearVisitKeyCache();

  // 4. Delete per-person rows whose week and month are both counted.
  const keepFrom = thisWeek < thisMonth ? thisWeek : thisMonth;
  report.visitRowsDeleted = await deleteInBatches('AreaVisit', Prisma.sql`day < ${keepFrom}::date`);
  return report;
}
