import { createHmac } from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';
import { db } from '../db';
import { getEnv } from '../env';
import { ApiError } from '../http';
import { COUNTABLE, statsDay } from './serve';

/**
 * D206: counting ads for the business's results (B3.5; the website shows them, D183).
 * A view is an ad card half on screen for a second (the phone decides that), counted once
 * per person per ad per day: `AdViewMark` holds a keyed hash of who saw it (never the ID)
 * and is deleted after two days. Interested / Not interested is one choice per person per
 * ad, moved between days' counts when it changes.
 */

/** A keyed hash of the viewer: same person, same value; can't be turned back into an ID. */
function viewerKey(viewer: string) {
  return createHmac('sha256', getEnv().SESSION_SECRET)
    .update(`ad-view:${viewer}`)
    .digest('base64url');
}

/** Counts the views in one batch; returns how many were new. */
export async function recordAdViews(viewer: string, adIds: string[], now = new Date()) {
  const ids = [...new Set(adIds)];
  const day = statsDay(now);
  const rows = await db.$queryRaw<{ n: number }[]>`
    WITH ins AS (
      INSERT INTO "AdViewMark" ("adId", "viewer", "day")
      SELECT a.id, ${viewerKey(viewer)}, ${day}::date FROM "Ad" a
      WHERE a.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) AND ${COUNTABLE}
      ON CONFLICT DO NOTHING
      RETURNING "adId"
    ), up AS (
      INSERT INTO "AdDailyStats" ("adId", "day", "views")
      SELECT "adId", ${day}::date, 1 FROM ins
      ON CONFLICT ("adId", "day") DO UPDATE SET "views" = "AdDailyStats"."views" + 1
      RETURNING 1
    )
    SELECT count(*)::int AS n FROM up`;
  return rows[0]?.n ?? 0;
}

type Choice = 'INTERESTED' | 'NOT_INTERESTED';
const column = (c: Choice) =>
  c === 'INTERESTED' ? Prisma.raw('"interested"') : Prisma.raw('"notInterested"');

/** Interested / Not interested on an ad (null takes it back). Returns the choice now. */
export async function setAdInterest(
  userId: string,
  adId: string,
  choice: Choice | null,
  now = new Date(),
) {
  const ad = await db.ad.findFirst({
    where: { id: adId, status: { in: ['APPROVED', 'PAUSED', 'ENDED'] } },
    select: { accountId: true },
  });
  if (!ad) throw new ApiError(404, 'NOT_FOUND', 'Ad not found');
  const day = statsDay(now);
  await db.$transaction(async (tx) => {
    const old = await tx.adInterest.findUnique({ where: { userId_adId: { userId, adId } } });
    if ((old?.choice ?? null) === choice) return;
    if (old) {
      await tx.$executeRaw`
        UPDATE "AdDailyStats" SET ${column(old.choice)} = GREATEST(0, ${column(old.choice)} - 1)
        WHERE "adId" = ${adId}::uuid AND "day" = ${old.countedOn}::date`;
    }
    if (choice === null) {
      await tx.adInterest.delete({ where: { userId_adId: { userId, adId } } });
      return;
    }
    await tx.$executeRaw`
      INSERT INTO "AdDailyStats" ("adId", "day", ${column(choice)})
      VALUES (${adId}::uuid, ${day}::date, 1)
      ON CONFLICT ("adId", "day") DO UPDATE SET ${column(choice)} = "AdDailyStats".${column(choice)} + 1`;
    await tx.adInterest.upsert({
      where: { userId_adId: { userId, adId } },
      create: { userId, adId, accountId: ad.accountId, choice, countedOn: day, updatedAt: now },
      update: { choice, countedOn: day, updatedAt: now },
    });
  });
  return choice;
}

/** Daily maintenance: view marks after two days, choices once older than both windows. */
export async function purgeAdMarks(now: Date, keepChoicesDays: number) {
  const viewMarks = await db.adViewMark.deleteMany({
    where: { day: { lt: new Date(statsDay(now).getTime() - 2 * 86_400_000) } },
  });
  const choices = await db.adInterest.deleteMany({
    where: { updatedAt: { lt: new Date(now.getTime() - keepChoicesDays * 86_400_000) } },
  });
  return { adViewMarksDeleted: viewMarks.count, adChoicesDeleted: choices.count };
}
