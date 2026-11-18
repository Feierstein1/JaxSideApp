import {
  AD_PER_BUSINESS_IN_LIST,
  localDate,
  localTime,
  inSchedule,
  NO_PLAN_ENTITLEMENTS,
  planEntitlements,
  targetsReader,
  type AdCard,
  type AdContext,
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
 *    screen (topics can be ad-free; D265: a place with a plan shows ALL of its own ads and no
 *    one else's, D167; no reach, cooldown or variety limits there), not
 *    marked Not interested by them, not in the phone's cooldown list, 21+ never for guests.
 * 3. Picked by weighted chance, one per business: D260 even pacing by area (an ad served less
 *    in the reader's ZIP, per day it has been live, gets up to 4× the chance; one served a lot
 *    there down to ¼×), × the plan tier (D240), × a Boost (D248), ×`ads.interestBoost` for
 *    places they favorited or businesses they marked Interested (at most
 *    `ads.boostedSharePercent` of the picks). D260: the first ad of a list goes to a paid
 *    (Standard / Premium) or boosted ad whenever one reaches the reader. D242: slots left over
 *    are filled with ads the phone saw recently. Every pick is counted in `AdServeStats`.
 */

const CACHE_MS = 60_000;
const CURRENT = ['TRIALING', 'ACTIVE', 'PAST_DUE'] as const;
const DAY_MS = 86_400_000;

export interface LiveAd {
  id: string;
  accountId: string;
  headline: string;
  body: string | null;
  mediaId: string | null;
  /** The picture's size, so the phone shows it whole. */
  mediaWidth: number | null;
  mediaHeight: number | null;
  adultsOnly: boolean;
  zips: string[];
  radiusMeters: number | null;
  cityWide: boolean;
  place: { id: string; name: string } | null;
  /** D230: the event it promotes, if any (only while it has a date to come). */
  event: AdCard['event'];
  /** Where the ad is "from" for radius targeting: its place, or its event's pin. */
  anchor: { latitude: number; longitude: number };
  /** D240: the business's tier: Premium 3, Standard 2, Free 1 (its plan's rank). */
  tierWeight: number;
  /** D260: when it went live (approved, or its start date if later), for its serve rate. */
  liveSince: Date;
  /** D248: boosted by the business: reaches everyone and weighs `ads.boostWeight` times more. */
  promoted: boolean;
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
          // D240: "Hosted at [place]" once the venue's owner confirmed it.
          venueStatus: true,
          placeId: true,
          hostPlaceId: true,
          place: { select: { id: true, name: true, category: true, status: true } },
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
      media: { select: { status: true, width: true, height: true } },
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
  // D248: live boosts (an ad's own, or its event's) and the Free radius.
  const [boostRows, nearMeters] = await Promise.all([
    db.boost.findMany({
      where: { status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
      select: { adId: true, eventId: true },
    }),
    getConfig('reach.nearMeters'),
  ]);
  const boostedEvents = new Set(boostRows.map((b) => b.eventId).filter(Boolean));
  const boostedAds = new Set(
    rows
      .filter(
        (r) =>
          boostRows.some((b) => b.adId === r.id) || (r.eventId && boostedEvents.has(r.eventId)),
      )
      .map((r) => r.id),
  );
  // D240: paid tiers show more often: weight = the plan's rank (Free 1, Standard 2, Premium 3).
  const ranks = new Map(subs.map((s) => [s.accountId, Math.max(1, Math.min(3, s.plan.rank))]));
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
    // D248: Free reaches about a mile around the place (or the event), whatever the ad row
    // says; a boost (the business's) reaches everyone in Duval.
    const boosted = boostedAds.has(r.id);
    const near = !boosted && plan['ads.reach'] === 'NEAR';
    out.push({
      id: r.id,
      accountId: r.accountId,
      headline: r.headline,
      body: r.body,
      mediaId: r.mediaId && r.media?.status === 'ACTIVE' ? r.mediaId : null,
      mediaWidth: r.media?.width ?? null,
      mediaHeight: r.media?.height ?? null,
      adultsOnly: r.adultsOnly,
      zips: boosted || near ? [] : ownZipEvent ? (r.event!.zip ? [r.event!.zip] : []) : r.zips,
      radiusMeters: boosted ? null : near ? nearMeters : ownZipEvent ? null : r.radiusMeters,
      cityWide: boosted ? true : near || ownZipEvent ? false : r.cityWide,
      promoted: boosted,
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
              hostedAt:
                r.event.venueStatus === 'CONFIRMED' &&
                r.event.place?.status === 'ACTIVE' &&
                r.event.placeId !== r.event.hostPlaceId
                  ? {
                      placeId: r.event.place.id,
                      name: r.event.place.name,
                      category: r.event.place.category,
                    }
                  : null,
            }
          : null,
      // D248: an event ad's "near" is measured from the event, not the business's place.
      anchor:
        near && r.event && r.event.latitude !== null
          ? { latitude: r.event.latitude, longitude: r.event.longitude! }
          : { latitude: anchor.latitude, longitude: anchor.longitude },
      tierWeight: ranks.get(r.accountId) ?? 1,
      liveSince: new Date(
        Math.max((r.approvedAt ?? r.createdAt).getTime(), r.startsAt?.getTime() ?? 0),
      ),
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
export async function placeOwnerWithPlan(placeId: string, now: Date) {
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
  /** D240: ads already placed in this list, in order (older apps send none). */
  inList: string[] = [],
  /** D265: extra ads for the end of a business's own place page (see `showcase`). */
  extra = 0,
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
      getConfig('ads.boostWeight'),
    ]),
  ]);
  const [boost, sharePercent, hideDays, interestDays, promotedWeight] = cfg;
  const onlyAccount = context.kind === 'place' ? await placeOwnerWithPlan(context.id, now) : null;
  const seenSet = new Set([...seen, ...inList]);
  // D240: what this list already shows: a business at most twice and never twice in a row.
  const placed = inList.length
    ? await db.ad.findMany({
        where: { id: { in: inList } },
        select: { id: true, accountId: true },
      })
    : [];
  const placedById = new Map(placed.map((a) => [a.id, a]));
  const perBusiness = new Map<string, number>();
  for (const a of placed) perBusiness.set(a.accountId, (perBusiness.get(a.accountId) ?? 0) + 1);
  const lastBusiness = placedById.get(inList[inList.length - 1] ?? '')?.accountId ?? null;

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

  const inListSet = new Set(inList);
  // D265 (owner): on the page of a place whose business has a current plan, show ALL of that
  // business's live ads (the page is theirs): whatever their kind, however many (the plan's
  // live limit already applies), oldest first, without the per-list variety limits, the
  // phone's cooldown or area targeting (the reader is standing at the place). Still left out:
  // a business the reader marked Not interested, 21+ ads for guests, and ads already in the list.
  if (onlyAccount) {
    const own = all.filter(
      (ad) =>
        ad.accountId === onlyAccount &&
        !hidden.has(ad.accountId) &&
        !(ad.adultsOnly && !reader.userId) &&
        !inListSet.has(ad.id),
    );
    return handOut(reader, own.slice(0, count + extra), now, zip ?? '');
  }
  if (count <= 0) return []; // only a business's own page has anything to show with no slots
  const allowed = all.filter(
    (ad) =>
      !inListSet.has(ad.id) &&
      !hidden.has(ad.accountId) &&
      !(ad.adultsOnly && !reader.userId) &&
      (onlyAccount === null || ad.accountId === onlyAccount) &&
      (perBusiness.get(ad.accountId) ?? 0) < AD_PER_BUSINESS_IN_LIST &&
      ad.accountId !== lastBusiness &&
      targetsReader(ad, ad.anchor, { point: reader.point, zip }),
  );
  // Fresh ads first; D240 (owner: "only one ad in 9 posts"): when there aren't enough, the
  // slots are filled with ads this phone saw recently rather than left empty.
  const eligible = allowed.filter((ad) => !seenSet.has(ad.id));
  const recent = allowed.filter((ad) => seenSet.has(ad.id));
  if (!allowed.length) return [];

  // D260: pacing by area over each ad's whole run: how often it was served in the reader's
  // ZIP per day it has been live. Ads behind the others there catch up; ads ahead ease off.
  const zipKey = zip ?? '';
  const served = await db.adServeStats.groupBy({
    by: ['adId'],
    where: { zip: zipKey, adId: { in: allowed.map((a) => a.id) } },
    _sum: { serves: true },
  });
  const servedBy = new Map(served.map((r) => [r.adId, r._sum.serves ?? 0]));
  const rate = (ad: LiveAd) =>
    (servedBy.get(ad.id) ?? 0) / Math.max(1, (now.getTime() - ad.liveSince.getTime()) / DAY_MS);
  const avg = allowed.reduce((n, a) => n + rate(a), 0) / allowed.length;
  const toPool = (list: LiveAd[]) =>
    list.map((ad) => {
      const isBoosted =
        liked.has(ad.accountId) || (ad.place !== null && favoritePlaces.has(ad.place.id));
      const pace = Math.min(4, Math.max(0.25, (avg + 1) / (rate(ad) + 1)));
      return {
        item: ad,
        // D248: a business's Boost weighs `ads.boostWeight` times more.
        weight: pace * (isBoosted ? boost : 1) * ad.tierWeight * (ad.promoted ? promotedWeight : 1),
        boosted: isBoosted,
        group: ad.accountId,
      };
    });
  const maxBoosted = Math.ceil((count * sharePercent) / 100);
  // D260: the first ad of a list (nothing placed yet) is a paid or boosted one when any
  // reaches this reader: a fresh one if there is, else one seen recently.
  const isPaid = (ad: LiveAd) => ad.tierWeight >= 2 || ad.promoted;
  const first: LiveAd[] = [];
  if (!inList.length) {
    const paidFresh = eligible.filter(isPaid);
    first.push(
      ...weightedPick(toPool(paidFresh.length ? paidFresh : recent.filter(isPaid)), 1, 1, rand),
    );
  }
  const firstBusiness = new Set(first.map((a) => a.accountId));
  const picked = [
    ...first,
    ...weightedPick(
      toPool(eligible.filter((ad) => !firstBusiness.has(ad.accountId))),
      count - first.length,
      maxBoosted,
      rand,
    ),
  ];
  if (picked.length < count && recent.length) {
    // The same variety rules: other businesses than the ones just picked.
    const used = new Set(picked.map((a) => a.accountId));
    picked.push(
      ...weightedPick(
        toPool(recent.filter((ad) => !used.has(ad.accountId))),
        count - picked.length,
        count,
        rand,
      ),
    );
  }

  return handOut(reader, picked, now, zipKey);
}

/**
 * Counts what is handed out (D260) and shapes the ads for the phone.
 */
async function handOut(
  reader: AdReader,
  picked: LiveAd[],
  now: Date,
  zipKey: string,
): Promise<AdCard[]> {
  const day = new Date(`${localDayHour(now).day}T00:00:00Z`);
  // D260: by day and the reader's ZIP (counts only).
  if (picked.length) {
    await db.$executeRaw`
      INSERT INTO "AdServeStats" ("adId", day, zip, serves)
      VALUES ${Prisma.join(picked.map((a) => Prisma.sql`(${a.id}::uuid, ${day}::date, ${zipKey}, 1)`))}
      ON CONFLICT ("adId", day, zip) DO UPDATE SET serves = "AdServeStats".serves + 1`;
  }

  const mine = reader.userId
    ? await db.adInterest.findMany({
        where: { userId: reader.userId, adId: { in: picked.map((a) => a.id) } },
        select: { adId: true, choice: true },
      })
    : [];
  const myChoice = new Map(mine.map((m) => [m.adId, m.choice]));
  return picked.map((ad) => ({
    id: ad.id,
    headline: ad.headline,
    body: ad.body,
    imageUrl: ad.mediaId ? signedAdImageUrl(ad.mediaId, now) : null,
    imageWidth: ad.mediaId ? ad.mediaWidth : null,
    imageHeight: ad.mediaId ? ad.mediaHeight : null,
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
