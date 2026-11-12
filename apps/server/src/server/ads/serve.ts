import {
  localDate,
  localTime,
  inSchedule,
  NO_PLAN_ENTITLEMENTS,
  planEntitlements,
  targetsReader,
  type AdCard,
  type AdContext,
  type AdTemplateKind,
} from '@jax/shared';
import { Prisma } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { signedAdImageUrl } from '../media/photos';
import { localDayHour } from '../stats/area-visits';

/**
 * D206: which ads a reader sees (B3.4). The phone asks for a few ads for the screen it is on
 * and places them between posts (shared `adSlotPositions`); everything about *which* ads is
 * decided here.
 *
 * 1. Live ads (cached for a minute): approved, inside their dates, days and hours
 *    (`inSchedule`), the place active, the business not revoked or suspended, and its
 *    current plan allowing ads; at most `ads.live` per business (its oldest approved first,
 *    since the website pauses the newest on a downgrade).
 * 2. For this reader: reach (city-wide, or a ZIP containing them, or a radius; D204), the
 *    screen (topics can be ad-free; a place with a plan shows only its own ads, D167), not
 *    marked Not interested by them, not in the phone's cooldown list, 21+ never for guests.
 * 3. Picked by weighted chance, one per business: even pacing (an ad with many views today
 *    weighs less), ×`ads.interestBoost` for places they favorited or businesses they marked
 *    Interested, with boosted ads at most `ads.boostedSharePercent` of the picks so new
 *    businesses still reach them. Slots are left empty rather than repeating an ad.
 */

const CACHE_MS = 60_000;
const CURRENT = ['TRIALING', 'ACTIVE', 'PAST_DUE'] as const;
const DAY_MS = 86_400_000;

export interface LiveAd {
  id: string;
  accountId: string;
  template: AdTemplateKind;
  headline: string;
  body: string | null;
  mediaId: string | null;
  adultsOnly: boolean;
  zips: string[];
  radiusMeters: number | null;
  cityWide: boolean;
  place: { id: string; name: string } | null;
  /** D230: the event it promotes, if any (only while it has a date to come). */
  event: { id: string; title: string; date: string; startTime: string } | null;
  /** Where the ad is "from" for radius targeting: its place, or its event's pin. */
  anchor: { latitude: number; longitude: number };
  /** D216: shown only when the business's current plan allows links (`ads.links`). */
  link: { url: string; label: string } | null;
}

let cache: { at: number; ads: LiveAd[] } | null = null;

/** Tests (and an admin approving an ad) start from fresh data. */
export function resetAdCache() {
  cache = null;
}

async function loadLiveAds(now: Date): Promise<LiveAd[]> {
  const rows = await db.ad.findMany({
    where: { status: 'APPROVED', OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    orderBy: [{ approvedAt: 'asc' }, { id: 'asc' }],
    include: {
      place: { select: { id: true, name: true, latitude: true, longitude: true, status: true } },
      // D230: an event ad shows while its event is approved and has a date to come.
      event: {
        select: {
          id: true,
          title: true,
          status: true,
          latitude: true,
          longitude: true,
          zip: true,
          sessions: {
            where: { endsAt: { gt: now } },
            orderBy: { startsAt: 'asc' },
            take: 1,
            select: { startsAt: true },
          },
        },
      },
      account: {
        select: { revokedAt: true, suspendedAt: true, suspendedUntil: true },
      },
      media: { select: { status: true } },
    },
  });
  const accountIds = [...new Set(rows.map((r) => r.accountId))];
  const subs = await db.subscription.findMany({
    where: {
      accountId: { in: accountIds },
      status: { in: [...CURRENT] },
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    include: { plan: { include: { entitlements: true } } },
  });
  const plans = new Map(
    subs.map((s) => [
      s.accountId,
      { ...NO_PLAN_ENTITLEMENTS, ...planEntitlements(s.plan.entitlements) },
    ]),
  );
  const perAccount = new Map<string, number>();
  const out: LiveAd[] = [];
  for (const r of rows) {
    const a = r.account;
    if (a.revokedAt || a.suspendedAt || (a.suspendedUntil && a.suspendedUntil > now)) continue;
    if (r.place && r.place.status !== 'ACTIVE') continue;
    const next = r.event?.sessions[0];
    if (r.event && (r.event.status !== 'APPROVED' || !next || r.event.latitude === null)) continue;
    const anchor =
      r.place ?? (r.event ? { latitude: r.event.latitude!, longitude: r.event.longitude! } : null);
    if (!anchor) continue;
    if (!inSchedule(r, now)) continue;
    const used = perAccount.get(r.accountId) ?? 0;
    const plan = plans.get(r.accountId) ?? NO_PLAN_ENTITLEMENTS;
    if (used >= plan['ads.live']) continue;
    perAccount.set(r.accountId, used + 1);
    // D236: on a plan whose reach is its own ZIP, an event ad reaches the event's ZIP (set when
    // the event was approved), whatever the ad row says; organizers have no ZIP of their own.
    const ownZipEvent = !!r.event && plan['ads.reach'] === 'OWN_ZIP';
    out.push({
      id: r.id,
      accountId: r.accountId,
      template: r.template,
      headline: r.headline,
      body: r.body,
      mediaId: r.mediaId && r.media?.status === 'ACTIVE' ? r.mediaId : null,
      adultsOnly: r.adultsOnly,
      zips: ownZipEvent ? (r.event!.zip ? [r.event!.zip] : []) : r.zips,
      radiusMeters: ownZipEvent ? null : r.radiusMeters,
      cityWide: ownZipEvent ? false : r.cityWide,
      // D216: a downgrade hides the button at once (the website also pauses such ads).
      link:
        r.linkUrl && r.linkLabel && plan['ads.links']
          ? { url: r.linkUrl, label: r.linkLabel }
          : null,
      place: r.place ? { id: r.place.id, name: r.place.name } : null,
      event:
        r.event && next
          ? {
              id: r.event.id,
              title: r.event.title,
              date: localDate(next.startsAt),
              startTime: localTime(next.startsAt),
            }
          : null,
      anchor: { latitude: anchor.latitude, longitude: anchor.longitude },
    });
  }
  return out;
}

export async function liveAds(now = new Date()): Promise<LiveAd[]> {
  if (cache && now.getTime() - cache.at < CACHE_MS) return cache.ads;
  const ads = await loadLiveAds(now);
  cache = { at: now.getTime(), ads };
  return ads;
}

/** The ZIP code containing a point (D116 ZIP shapes), or null outside them. */
export async function zipAt(point: { latitude: number; longitude: number }) {
  const [row] = await db.$queryRaw<{ zip: string }[]>`
    SELECT zip FROM "ZipArea"
    WHERE ST_Covers(geom, ST_SetSRID(ST_MakePoint(${point.longitude}, ${point.latitude}), 4326)::geography)
    LIMIT 1`;
  return row?.zip ?? null;
}

export interface Weighted<T> {
  item: T;
  weight: number;
  boosted: boolean;
  group: string;
}

/**
 * Weighted picks without repeats: at most one per `group` (business), at most `maxBoosted`
 * boosted ones. `rand` is injectable so tests are exact.
 */
export function weightedPick<T>(
  pool: Weighted<T>[],
  count: number,
  maxBoosted: number,
  rand: () => number = Math.random,
): T[] {
  let left = pool.filter((p) => p.weight > 0);
  const picked: T[] = [];
  let boosted = 0;
  while (picked.length < count && left.length) {
    const total = left.reduce((n, p) => n + p.weight, 0);
    let r = rand() * total;
    let i = 0;
    while (i < left.length - 1 && r >= left[i]!.weight) r -= left[i++]!.weight;
    const chosen = left[i]!;
    picked.push(chosen.item);
    if (chosen.boosted) boosted++;
    left = left.filter((p) => p.group !== chosen.group && !(p.boosted && boosted >= maxBoosted));
  }
  return picked;
}

export interface AdReader {
  /** Signed-in person (null for a guest). */
  userId: string | null;
  point: { latitude: number; longitude: number };
}

/** D167: on a place's page, a business with a current plan shows only its own ads. */
async function placeOwnerWithPlan(placeId: string, now: Date) {
  const access = await db.businessPlaceAccess.findFirst({
    where: { placeId, role: 'OWNER', revokedAt: null },
    select: { accountId: true },
  });
  if (!access) return null;
  const sub = await db.subscription.findFirst({
    where: {
      accountId: access.accountId,
      status: { in: [...CURRENT] },
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    select: { id: true },
  });
  return sub ? access.accountId : null;
}

export async function pickAdsFor(
  reader: AdReader,
  context: AdContext,
  count: number,
  seen: string[],
  now = new Date(),
  rand: () => number = Math.random,
): Promise<AdCard[]> {
  if (context.kind === 'topic') {
    const t = await db.cityTopic.findUnique({
      where: { id: context.id },
      select: { adFree: true },
    });
    if (!t || t.adFree) return [];
  }
  const [all, zip, cfg] = await Promise.all([
    liveAds(now),
    zipAt(reader.point),
    Promise.all([
      getConfig('ads.interestBoost'),
      getConfig('ads.boostedSharePercent'),
      getConfig('ads.notInterestedDays'),
      getConfig('ads.interestedDays'),
    ]),
  ]);
  const [boost, sharePercent, hideDays, interestDays] = cfg;
  const onlyAccount = context.kind === 'place' ? await placeOwnerWithPlan(context.id, now) : null;
  const seenSet = new Set(seen);

  let hidden = new Set<string>();
  let liked = new Set<string>();
  let favoritePlaces = new Set<string>();
  if (reader.userId) {
    const since = new Date(now.getTime() - Math.max(hideDays, interestDays) * DAY_MS);
    const [choices, favorites] = await Promise.all([
      db.adInterest.findMany({
        where: { userId: reader.userId, updatedAt: { gt: since } },
        select: { accountId: true, choice: true, updatedAt: true },
      }),
      db.favoritePlace.findMany({ where: { userId: reader.userId }, select: { placeId: true } }),
    ]);
    const within = (at: Date, days: number) => now.getTime() - at.getTime() < days * DAY_MS;
    hidden = new Set(
      choices
        .filter((c) => c.choice === 'NOT_INTERESTED' && within(c.updatedAt, hideDays))
        .map((c) => c.accountId),
    );
    liked = new Set(
      choices
        .filter((c) => c.choice === 'INTERESTED' && within(c.updatedAt, interestDays))
        .map((c) => c.accountId),
    );
    favoritePlaces = new Set(favorites.map((f) => f.placeId));
  }

  const eligible = all.filter(
    (ad) =>
      !seenSet.has(ad.id) &&
      !hidden.has(ad.accountId) &&
      !(ad.adultsOnly && !reader.userId) &&
      (onlyAccount === null || ad.accountId === onlyAccount) &&
      targetsReader(ad, ad.anchor, { point: reader.point, zip }),
  );
  if (!eligible.length) return [];

  // Pacing: today's views per ad; an ad far ahead of the others weighs less.
  const day = new Date(`${localDayHour(now).day}T00:00:00Z`);
  const stats = await db.adDailyStats.findMany({
    where: { day, adId: { in: eligible.map((a) => a.id) } },
    select: { adId: true, views: true },
  });
  const views = new Map(stats.map((s) => [s.adId, s.views]));
  const avg = eligible.reduce((n, a) => n + (views.get(a.id) ?? 0), 0) / eligible.length;
  const pool = eligible.map((ad) => {
    const isBoosted =
      liked.has(ad.accountId) || (ad.place !== null && favoritePlaces.has(ad.place.id));
    const pace = Math.min(4, Math.max(0.25, (avg + 1) / ((views.get(ad.id) ?? 0) + 1)));
    return {
      item: ad,
      weight: pace * (isBoosted ? boost : 1),
      boosted: isBoosted,
      group: ad.accountId,
    };
  });
  const maxBoosted = Math.ceil((count * sharePercent) / 100);
  const picked = weightedPick(pool, count, maxBoosted, rand);

  const mine = reader.userId
    ? await db.adInterest.findMany({
        where: { userId: reader.userId, adId: { in: picked.map((a) => a.id) } },
        select: { adId: true, choice: true },
      })
    : [];
  const myChoice = new Map(mine.map((m) => [m.adId, m.choice]));
  return picked.map((ad) => ({
    id: ad.id,
    template: ad.template,
    headline: ad.headline,
    body: ad.body,
    imageUrl: ad.mediaId ? signedAdImageUrl(ad.mediaId, now) : null,
    adultsOnly: ad.adultsOnly,
    place: ad.place,
    event: ad.event,
    link: ad.link,
    myChoice: myChoice.get(ad.id) ?? null,
  }));
}

/** The Jacksonville day as a DATE value (the key of AdDailyStats). */
export const statsDay = (now: Date) => new Date(`${localDayHour(now).day}T00:00:00Z`);

/** Raw SQL fragment for "this ad can be counted": it has been approved at some point. */
export const COUNTABLE = Prisma.sql`a.status IN ('APPROVED', 'PAUSED', 'ENDED')`;
