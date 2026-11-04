import { db } from './db';
import { logger } from './logger';
import { localDayHour } from './stats/area-visits';

/**
 * D188: notes that a signed-in person used the app today (Jacksonville time), for giveaway
 * tickets. One row per person per day and nothing else. Each server process remembers who it
 * already noted today, so this is one insert per person per day, not one per request.
 */

let today = '';
const noted = new Set<string>();

export async function recordActiveDay(userId: string, now = new Date()) {
  const { day } = localDayHour(now);
  if (day !== today) {
    today = day;
    noted.clear();
  }
  if (noted.has(userId)) return;
  try {
    await db.$executeRaw`
      INSERT INTO "UserActiveDay" ("userId", day) VALUES (${userId}::uuid, ${day}::date)
      ON CONFLICT DO NOTHING`;
    noted.add(userId);
  } catch (err) {
    // Never fail the request over a ticket.
    logger.warn({ err }, 'active day not recorded');
  }
}

/** Tests only: forget what this process noted. */
export function resetActiveDayCache() {
  today = '';
  noted.clear();
}
