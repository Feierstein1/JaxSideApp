import type { BusinessAccount } from '@/generated/prisma/client';
import { db } from './db';
import { ApiError } from './http';
import { requirePlace } from './places';

/**
 * B3.5 (D166): what an ad did, for the Owner. Read from the daily totals the app keeps
 * (AdDailyStats: views, Interested, Not interested per ad per day; never one row per view,
 * never who). Totals are shown as they are; in the day-by-day list any number under 10 is
 * shown as "fewer than 10", so no small breakdown is ever visible.
 */

export const MIN_BREAKDOWN = 10;
const DAY = 86_400_000;

const small = (n: number) => (n < MIN_BREAKDOWN ? null : n);

export async function adStats(account: BusinessAccount, adId: string, now = new Date()) {
  if (!/^[0-9a-f-]{36}$/i.test(adId)) throw new ApiError(404, 'NOT_FOUND', 'Ad not found.');
  const ad = await db.ad.findFirst({
    where: { id: adId, accountId: account.createdById ?? account.id },
    select: { id: true, headline: true, placeId: true },
  });
  if (!ad) throw new ApiError(404, 'NOT_FOUND', 'Ad not found.');
  // 🔒 The Owner of the ad's place only (the same rule as sending and pausing ads).
  await requirePlace(account.id, ad.placeId, 'publishAds');

  const rows = await db.adDailyStats.findMany({
    where: { adId },
    orderBy: { day: 'desc' },
  });
  const since = new Date(now.getTime() - 30 * DAY);
  const sum = (list: typeof rows) =>
    list.reduce(
      (t, r) => ({
        views: t.views + r.views,
        interested: t.interested + r.interested,
        notInterested: t.notInterested + r.notInterested,
      }),
      { views: 0, interested: 0, notInterested: 0 },
    );
  return {
    ad: { id: ad.id, headline: ad.headline, placeId: ad.placeId },
    allTime: sum(rows),
    last30Days: sum(rows.filter((r) => r.day >= since)),
    days: rows.slice(0, 60).map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      views: small(r.views),
      interested: small(r.interested),
      notInterested: small(r.notInterested),
    })),
    minBreakdown: MIN_BREAKDOWN,
  };
}
