import { createHmac } from 'node:crypto';
import { createUserKey, unwrapUserKey } from '../crypto/field-encryption';
import { db } from '../db';

/**
 * D116: anonymous area statistics, "count, don't record". When a signed-in person loads the
 * area feed, we note that someone was in that ZIP code area today (Jacksonville time), and in
 * which part of the day. The row carries two codes made from the account ID with this week's
 * and this month's secret key (so a person counts once per day, week and month), never the ID
 * and never the coordinates. The nightly job turns the rows into counts, deletes them, and
 * destroys each key when its period ends; after that nothing links back to anyone.
 */

const TZ = 'America/New_York';
const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
});

/** The local (Jacksonville) date "YYYY-MM-DD" and hour 0–23. */
export function localDayHour(at: Date): { day: string; hour: number } {
  const p = Object.fromEntries(parts.formatToParts(at).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

/** The Monday on or before a "YYYY-MM-DD" date. */
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Parts of the day as bits: 1 morning (6–12), 2 afternoon (12–17), 4 evening (17–22), 8 night. */
export function daypart(hour: number): number {
  if (hour >= 6 && hour < 12) return 1;
  if (hour >= 12 && hour < 17) return 2;
  if (hour >= 17 && hour < 22) return 4;
  return 8;
}

/** In-memory copies of the current periods' keys (each process loads them once). */
const keys = new Map<string, Buffer>();

/** The secret key for a period ("week:2026-10-19" / "month:2026-10"), created on first use. */
async function periodKey(period: string): Promise<Buffer> {
  const cached = keys.get(period);
  if (cached) return cached;
  const owner = `visitkey:${period}`;
  // Two processes may race to create it: the first insert wins and both read that one.
  await db.visitKey.createMany({
    data: [{ period, keyWrapped: Buffer.from(createUserKey(owner).wrapped) }],
    skipDuplicates: true,
  });
  const row = await db.visitKey.findUniqueOrThrow({ where: { period } });
  const key = unwrapUserKey(owner, row.keyWrapped);
  if (keys.size > 8) keys.clear(); // only the current week and month are ever needed
  keys.set(period, key);
  return key;
}

const code = (key: Buffer, userId: string) =>
  createHmac('sha256', key).update(userId).digest().subarray(0, 16);

/** Forget cached keys (tests, and after the job destroys old ones). */
export function clearVisitKeyCache() {
  keys.clear();
}

/**
 * Notes the visit. One small write: nothing if this person was already counted in this ZIP
 * in this part of today, nothing outside the ZIP areas, nothing if they switched it off.
 */
export async function recordAreaVisit(
  userId: string,
  at: { latitude: number; longitude: number },
  now = new Date(),
) {
  const { day, hour } = localDayHour(now);
  const [monthKey, weekKey] = await Promise.all([
    periodKey(`month:${day.slice(0, 7)}`),
    periodKey(`week:${weekStart(day)}`),
  ]);
  await db.$executeRaw`
    INSERT INTO "AreaVisit" (day, zip, "visitorMonth", "visitorWeek", dayparts)
    SELECT ${day}::date, z.zip, ${code(monthKey, userId)}, ${code(weekKey, userId)},
           ${daypart(hour)}::smallint
    FROM "ZipArea" z
    WHERE ST_Covers(z.geom, ST_SetSRID(ST_MakePoint(${at.longitude}, ${at.latitude}), 4326)::geography)
      AND NOT EXISTS (SELECT 1 FROM "UserSettings" s
                      WHERE s."userId" = ${userId}::uuid AND s."areaStatsOptOut")
    ORDER BY z.zip
    LIMIT 1
    ON CONFLICT (day, zip, "visitorMonth")
      DO UPDATE SET dayparts = "AreaVisit".dayparts | EXCLUDED.dayparts
      WHERE ("AreaVisit".dayparts & EXCLUDED.dayparts) = 0`;
}
