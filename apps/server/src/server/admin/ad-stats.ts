import { adSubject } from './ad-review';
import { describeSchedule } from '@jax/shared';
import { Prisma } from '@/generated/prisma/client';
import { statsDay } from '../ads/serve';
import { db } from '../db';
import { ApiError } from '../http';
import { pageWindow, toPage } from './paging';

/**
 * D210: how ads are doing, for the admin portal. Read only from the daily totals the app
 * keeps (`AdDailyStats`: views, Interested, Not interested per ad per day; D206). There is
 * no record of who saw an ad, so none is shown. Unlike the website (which hides any daily
 * number under 10 from the business), admins see the exact totals.
 */

const DAY = 86_400_000;

export const AD_TABS = ['review', 'live', 'past'] as const;
export type AdTab = (typeof AD_TABS)[number];
export const adTab = (raw: unknown): AdTab =>
  AD_TABS.includes(raw as AdTab) ? (raw as AdTab) : 'review';

const STATUSES: Record<Exclude<AdTab, 'review'>, ('APPROVED' | 'PAUSED' | 'ENDED')[]> = {
  live: ['APPROVED'],
  past: ['PAUSED', 'ENDED'],
};

export interface AdNumbers {
  views: number;
  interested: number;
  notInterested: number;
}

/** Interested as a share of everyone who answered (null with no answers). */
export const interestShare = (n: AdNumbers) =>
  n.interested + n.notInterested ? n.interested / (n.interested + n.notInterested) : null;

type SumRow = { adId: string; views: bigint; interested: bigint; notInterested: bigint };
const numbers = (r?: SumRow): AdNumbers => ({
  views: Number(r?.views ?? 0),
  interested: Number(r?.interested ?? 0),
  notInterested: Number(r?.notInterested ?? 0),
});

/** Totals per ad since `from` (all time without it). */
async function sums(adIds: string[], from?: Date) {
  if (!adIds.length) return new Map<string, AdNumbers>();
  const rows = await db.$queryRaw<SumRow[]>`
    SELECT "adId", sum(views) AS views, sum(interested) AS interested,
           sum("notInterested") AS "notInterested"
    FROM "AdDailyStats"
    WHERE "adId" IN (${Prisma.join(adIds.map((id) => Prisma.sql`${id}::uuid`))})
      ${from ? Prisma.sql`AND day >= ${from}::date` : Prisma.empty}
    GROUP BY "adId"`;
  return new Map(rows.map((r) => [r.adId, numbers(r)]));
}

/** The tiles above the list: live ads and what all ads did today and in 30 days. */
export async function adOverview(now = new Date()) {
  const today = statsDay(now);
  const since = new Date(today.getTime() - 29 * DAY);
  const [live, waiting, rows] = await Promise.all([
    db.ad.count({ where: { status: 'APPROVED' } }),
    db.ad.count({ where: { status: 'PENDING_REVIEW' } }),
    db.$queryRaw<{ today: bigint; views: bigint; interested: bigint; notInterested: bigint }[]>`
      SELECT coalesce(sum(views) FILTER (WHERE day = ${today}::date), 0) AS today,
             coalesce(sum(views), 0) AS views,
             coalesce(sum(interested), 0) AS interested,
             coalesce(sum("notInterested"), 0) AS "notInterested"
      FROM "AdDailyStats" WHERE day >= ${since}::date`,
  ]);
  const r = rows[0];
  return {
    live,
    waiting,
    viewsToday: Number(r?.today ?? 0),
    last30Days: {
      views: Number(r?.views ?? 0),
      interested: Number(r?.interested ?? 0),
      notInterested: Number(r?.notInterested ?? 0),
    },
  };
}

const reachOf = (a: { cityWide: boolean; zips: string[]; radiusMeters: number | null }) =>
  a.cityWide
    ? 'City-wide'
    : [
        a.zips.length ? `ZIP ${a.zips.join(', ')}` : null,
        a.radiusMeters ? `${a.radiusMeters} m around the place` : null,
      ]
        .filter(Boolean)
        .join(' · ') || 'No targeting';

/** Live (approved) or past (paused, ended) ads, newest approval first, with their numbers. */
export async function listAdsWithStats(tab: 'live' | 'past', page: number, now = new Date()) {
  const where = { status: { in: STATUSES[tab] } } satisfies Prisma.AdWhereInput;
  const [ads, total] = await Promise.all([
    db.ad.findMany({
      where,
      orderBy: [{ approvedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      ...pageWindow(page),
      select: {
        id: true,
        headline: true,
        status: true,
        template: true,
        startsAt: true,
        endsAt: true,
        approvedAt: true,
        cityWide: true,
        zips: true,
        radiusMeters: true,
        place: { select: { id: true, name: true } },
        event: { select: { id: true, title: true } },
      },
    }),
    db.ad.count({ where }),
  ]);
  const ids = ads.map((a) => a.id);
  const since = new Date(statsDay(now).getTime() - 29 * DAY);
  const [recent, allTime] = await Promise.all([sums(ids, since), sums(ids)]);
  return toPage(
    ads.map((a) => ({
      id: a.id,
      headline: a.headline,
      status: a.status,
      template: a.template,
      place: adSubject(a),
      reach: reachOf(a),
      startsAt: a.startsAt?.toISOString() ?? null,
      endsAt: a.endsAt?.toISOString() ?? null,
      approvedAt: a.approvedAt?.toISOString() ?? null,
      last30Days: recent.get(a.id) ?? numbers(),
      allTime: allTime.get(a.id) ?? numbers(),
    })),
    total,
    page,
  );
}

/** One ad: what it says, its totals, and its numbers day by day (20 days a page). */
export async function getAdStats(adId: string, daysPage: number, now = new Date()) {
  const ad = await db.ad.findUnique({
    where: { id: adId },
    include: {
      place: { select: { id: true, name: true, address: true } },
      event: { select: { id: true, title: true } },
      account: { select: { id: true, email: true } },
      media: { select: { id: true } },
    },
  });
  if (!ad) throw new ApiError(404, 'NOT_FOUND', 'Ad not found');
  const since = new Date(statsDay(now).getTime() - 29 * DAY);
  const [recent, allTime, days, dayCount] = await Promise.all([
    sums([ad.id], since),
    sums([ad.id]),
    db.adDailyStats.findMany({
      where: { adId },
      orderBy: { day: 'desc' },
      ...pageWindow(daysPage),
    }),
    db.adDailyStats.count({ where: { adId } }),
  ]);
  return {
    ad: {
      id: ad.id,
      headline: ad.headline,
      body: ad.body,
      status: ad.status,
      template: ad.template,
      adultsOnly: ad.adultsOnly,
      imageUrl: ad.media ? `/api/v1/admin/business-pictures/${ad.media.id}` : null,
      place: adSubject(ad),
      business: { id: ad.account.id, email: ad.account.email ?? '' },
      schedule: describeSchedule(ad),
      reach: reachOf(ad),
      startsAt: ad.startsAt?.toISOString() ?? null,
      endsAt: ad.endsAt?.toISOString() ?? null,
      approvedAt: ad.approvedAt?.toISOString() ?? null,
    },
    last30Days: recent.get(ad.id) ?? numbers(),
    allTime: allTime.get(ad.id) ?? numbers(),
    days: toPage(
      days.map((d) => ({
        day: d.day.toISOString().slice(0, 10),
        views: d.views,
        interested: d.interested,
        notInterested: d.notInterested,
      })),
      dayCount,
      daysPage,
    ),
  };
}
