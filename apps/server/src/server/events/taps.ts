import { statsDay } from '../ads/serve';
import { viewerKey } from '../ads/counting';
import { db } from '../db';

/**
 * D236: a tap on an event's link button (after "You're leaving JaxSide"), once per person per
 * event per day, like ad taps (D216). Counted in `EventDailyStats.taps` for the host's results.
 * Only approved events with a link count. Returns whether it counted.
 */
export async function recordEventTap(viewer: string, eventId: string, now = new Date()) {
  const day = statsDay(now);
  const rows = await db.$queryRaw<{ n: number }[]>`
    WITH ins AS (
      INSERT INTO "EventTapMark" ("eventId", "viewer", "day")
      SELECT e.id, ${viewerKey(viewer)}, ${day}::date FROM "Event" e
      WHERE e.id = ${eventId}::uuid AND e."linkUrl" IS NOT NULL AND e.status = 'APPROVED'
      ON CONFLICT DO NOTHING
      RETURNING "eventId"
    ), up AS (
      INSERT INTO "EventDailyStats" ("eventId", "day", "taps")
      SELECT "eventId", ${day}::date, 1 FROM ins
      ON CONFLICT ("eventId", "day") DO UPDATE SET "taps" = "EventDailyStats"."taps" + 1
      RETURNING 1
    )
    SELECT count(*)::int AS n FROM up`;
  return (rows[0]?.n ?? 0) > 0;
}
