import { db } from '../db';

/*
 * D230: bell notices about followed events (in-app only; phone push is out of scope). Changes
 * and cancellations go to every follower when they happen; reminders are made when a person's
 * app checks its badges (every 30 s while open), so no extra scheduled job is needed.
 */

/** Tells every follower that the event's dates, times or place changed, or that it's off. */
export async function notifyFollowers(eventId: string, type: 'EVENT_CHANGED' | 'EVENT_CANCELLED') {
  // One unread notice per event and kind: a second change replaces the first.
  await db.notification.deleteMany({
    where: { eventId, type, readAt: null, eventSessionId: null },
  });
  await db.$executeRaw`
    INSERT INTO "Notification" (id, "userId", type, "eventId", "createdAt")
    SELECT uuid_v7(), f."userId", ${type}::"NotificationType", ${eventId}::uuid, now()
    FROM "EventFollow" f
    WHERE f."eventId" = ${eventId}::uuid`;
}

/**
 * Makes this person's due reminders: "tomorrow" for followed sessions that start on the next
 * Jacksonville day, and "soon" for those starting within the hour. Each goes out once per
 * session (unique index `Notification_event_once`).
 */
export async function ensureEventReminders(userId: string) {
  await db.$executeRaw`
    INSERT INTO "Notification" (id, "userId", type, "eventId", "eventSessionId", "createdAt")
    SELECT uuid_v7(), f."userId",
           CASE WHEN s."startsAt" <= now() + interval '60 minutes'
                THEN 'EVENT_SOON'::"NotificationType" ELSE 'EVENT_TOMORROW'::"NotificationType" END,
           s."eventId", s.id, now()
    FROM "EventFollow" f
    JOIN "EventSession" s ON s."eventId" = f."eventId"
    JOIN "Event" e ON e.id = s."eventId"
    WHERE f."userId" = ${userId}::uuid
      AND e.status = 'APPROVED'
      AND s."startsAt" > now()
      AND (s."startsAt" <= now() + interval '60 minutes'
           OR (s."startsAt" AT TIME ZONE 'America/New_York')::date
              = (now() AT TIME ZONE 'America/New_York')::date + 1)
    ON CONFLICT DO NOTHING`;
}
