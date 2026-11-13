import {
  addDays,
  addMonths,
  EVENT_CATEGORIES,
  localDate,
  localTime,
  localToUtc,
  METERS_PER_MILE,
  milesToMeters,
  type EventCard,
  type EventCategory,
  type EventDay,
  type EventDayGroup,
  type EventDetail,
  type EventFilters,
  type EventMonth,
  type EventPage,
} from '@jax/shared';
import { Prisma } from '@/generated/prisma/client';
import { entitlementsFor } from '../admin/plans';
import { getConfig } from '../config';
import { db } from '../db';
import { decodeCursor, encodeCursor } from '../discussions/cursor';
import { ApiError } from '../http';
import type { GeoPoint } from '../location/eligibility';
import { signedEventImageUrl } from '../media/photos';
import { hostKey, settingKey } from './save';

/*
 * D230: what the Events tab reads. Only approved and cancelled events are ever served
 * (suggestions, drafts, events in review, denied and removed ones never are). Every read needs
 * a verified reading inside Duval (the route checks it); the reading also orders a day's
 * neighborhoods (yours and the nearest first) and powers the Nearby filter.
 */

const TZ = 'America/New_York';
const VISIBLE = Prisma.sql`e.status IN ('APPROVED', 'CANCELLED') AND e.latitude IS NOT NULL`;

const pinOf = Prisma.sql`ST_SetSRID(ST_MakePoint(e.longitude, e.latitude), 4326)::geography`;
const pointSql = (p: GeoPoint) =>
  Prisma.sql`ST_SetSRID(ST_MakePoint(${p.longitude}, ${p.latitude}), 4326)::geography`;

type Filters = Omit<EventFilters, 'kind'> & { kind?: 'all' | 'community' | 'business' };

/** The filters as SQL on `e` (Event) and `p` (its place). */
async function filterSql(viewerId: string, at: GeoPoint, f: Filters): Promise<Prisma.Sql[]> {
  const out: Prisma.Sql[] = [VISIBLE];
  if (f.q) {
    const like = '%' + f.q.replace(/[\\%_]/g, (c) => `\\${c}`) + '%';
    out.push(Prisma.sql`(e.title ILIKE ${like} OR e.description ILIKE ${like}
      OR e."venueName" ILIKE ${like} OR p.name ILIKE ${like} OR e.neighborhood ILIKE ${like})`);
  }
  if (f.nearby) {
    const meters = milesToMeters(await getConfig('events.nearbyMiles'));
    out.push(Prisma.sql`ST_DWithin(${pinOf}, ${pointSql(at)}, ${meters})`);
  }
  if (f.kind === 'business') out.push(Prisma.sql`e."hostKind" = 'BUSINESS'`);
  if (f.kind === 'community') out.push(Prisma.sql`e."hostKind" <> 'BUSINESS'`);
  if (f.setting === 'indoor') out.push(Prisma.sql`e.setting IN ('INDOOR', 'MIXED')`);
  if (f.setting === 'outdoor') out.push(Prisma.sql`e.setting IN ('OUTDOOR', 'MIXED')`);
  if (f.freeOnly) out.push(Prisma.sql`e.free`);
  if (f.following) {
    out.push(Prisma.sql`EXISTS (SELECT 1 FROM "EventFollow" f
      WHERE f."eventId" = e.id AND f."userId" = ${viewerId}::uuid)`);
  }
  return out;
}

type CardRow = {
  id: string;
  session_id: string;
  title: string;
  category: string;
  starts_at: Date;
  ends_at: Date;
  day_number: number;
  day_count: number;
  venue_name: string | null;
  address: string | null;
  place_id: string | null;
  place_name: string | null;
  host_place_id: string | null;
  host_place_name: string | null;
  host_place_category: string | null;
  venue_status: 'NONE' | 'ASKED' | 'CONFIRMED' | 'DISPUTED';
  place_category: string | null;
  organizer_name: string | null;
  neighborhood: string | null;
  zip: string | null;
  setting: 'INDOOR' | 'OUTDOOR' | 'MIXED';
  free: boolean;
  price_text: string | null;
  adults_only: boolean;
  family_friendly: boolean;
  host_kind: 'COMMUNITY' | 'BUSINESS' | 'ORGANIZER';
  image_id: string | null;
  following: boolean;
  status: string;
  meters: number;
};

/** One row per session, with everything a card shows. */
function selectCards(viewerId: string, at: GeoPoint, where: Prisma.Sql, tail: Prisma.Sql) {
  return db.$queryRaw<CardRow[]>`
    SELECT e.id, s.id AS session_id, e.title, e.category,
           s."startsAt" AS starts_at, s."endsAt" AS ends_at,
           (SELECT count(*)::int FROM "EventSession" x
             WHERE x."eventId" = e.id AND x."startsAt" <= s."startsAt") AS day_number,
           (SELECT count(*)::int FROM "EventSession" x WHERE x."eventId" = e.id) AS day_count,
           e."venueName" AS venue_name, e.address, e."placeId" AS place_id,
           p.name AS place_name, p.category AS place_category,
           hp.id AS host_place_id, hp.name AS host_place_name, hp.category AS host_place_category,
           e."venueStatus"::text AS venue_status,
           (SELECT o.name FROM "EventOrganizer" o
             WHERE o."accountId" = e."businessAccountId"
               AND o.status IN ('PENDING', 'VERIFIED')) AS organizer_name,
           e.neighborhood, e.zip, e.setting::text AS setting, e.free, e."priceText" AS price_text,
           e."adultsOnly" AS adults_only, e."familyFriendly" AS family_friendly,
           e."hostKind"::text AS host_kind,
           (SELECT i.id FROM "EventImage" i WHERE i."eventId" = e.id
             ORDER BY i.position, i.id LIMIT 1) AS image_id,
           EXISTS (SELECT 1 FROM "EventFollow" f
                   WHERE f."eventId" = e.id AND f."userId" = ${viewerId}::uuid) AS following,
           e.status::text AS status,
           ST_Distance(${pinOf}, ${pointSql(at)}) AS meters
    FROM "EventSession" s
    JOIN "Event" e ON e.id = s."eventId"
    LEFT JOIN "BusinessPlace" p ON p.id = e."placeId"
    LEFT JOIN "BusinessPlace" hp ON hp.id = e."hostPlaceId"
    WHERE ${where}
    ${tail}`;
}

const asCategory = (c: string): EventCategory =>
  c in EVENT_CATEGORIES ? (c as EventCategory) : 'other';

function toCard(r: CardRow, now = new Date()): EventCard {
  const host = hostKey(r.host_kind);
  return {
    id: r.id,
    sessionId: r.session_id,
    title: r.title,
    category: asCategory(r.category),
    startsAt: r.starts_at.toISOString(),
    endsAt: r.ends_at.toISOString(),
    date: localDate(r.starts_at),
    startTime: localTime(r.starts_at),
    endTime: localTime(r.ends_at),
    dayNumber: r.day_number,
    dayCount: r.day_count,
    // D236: while the place's owner disputes it, the place isn't named.
    venue: r.venue_name ?? (r.venue_status === 'DISPUTED' ? null : r.place_name) ?? r.address,
    venueConfirmedBy: r.venue_status === 'CONFIRMED' ? r.place_name : null,
    // D240: an organizer's (or another business's) event at a business that confirmed it.
    hostedAt:
      r.venue_status === 'CONFIRMED' && r.place_id && r.place_name && r.place_id !== r.host_place_id
        ? { placeId: r.place_id, name: r.place_name, category: r.place_category ?? '' }
        : null,
    neighborhood: r.neighborhood,
    zip: r.zip,
    setting: settingKey(r.setting),
    free: r.free,
    priceText: r.price_text,
    adultsOnly: r.adults_only,
    familyFriendly: r.family_friendly,
    host: {
      kind: host,
      // A business is its own place's name (D236: wherever the event is held); an organizer
      // shows its name unless JaxSide closed it (P18.9, D237).
      name:
        host === 'business' ? r.host_place_name : host === 'organizer' ? r.organizer_name : null,
      placeId: host === 'business' ? r.host_place_id : null,
      placeCategory: host === 'business' ? r.host_place_category : null,
    },
    imageUrl: r.image_id ? signedEventImageUrl(r.image_id, now) : null,
    following: r.following,
    cancelled: r.status === 'CANCELLED',
    happeningNow: r.status === 'APPROVED' && r.starts_at <= now && r.ends_at > now,
    distanceMiles: Math.round((r.meters / METERS_PER_MILE) * 10) / 10,
  };
}

/** Sessions that start on a Jacksonville date (as SQL on `s`). */
const startsOnSql = (from: string, toExclusive: string) =>
  Prisma.sql`s."startsAt" >= ${localToUtc(from, '00:00')} AND s."startsAt" < ${localToUtc(toExclusive, '00:00')}`;

/**
 * The calendar: how many approved events start on each day of the month (cancelled ones
 * aren't counted, though their day still lists them, marked Cancelled).
 */
export async function eventMonth(
  viewerId: string,
  at: GeoPoint,
  input: Filters & { month: string },
  now = new Date(),
): Promise<EventMonth> {
  const filters = await filterSql(viewerId, at, input);
  const rows = await db.$queryRaw<{ day: string; n: number }[]>`
    SELECT to_char((s."startsAt" AT TIME ZONE ${TZ})::date, 'YYYY-MM-DD') AS day,
           count(DISTINCT e.id)::int AS n
    FROM "EventSession" s
    JOIN "Event" e ON e.id = s."eventId"
    LEFT JOIN "BusinessPlace" p ON p.id = e."placeId"
    WHERE ${Prisma.join(filters, ' AND ')} AND e.status = 'APPROVED'
      AND ${startsOnSql(`${input.month}-01`, `${addMonths(input.month, 1)}-01`)}
    GROUP BY 1`;
  return {
    month: input.month,
    today: localDate(now),
    days: Object.fromEntries(rows.map((r) => [r.day, r.n])),
  };
}

/**
 * One day's events, grouped by neighborhood and ZIP. Groups: the nearest first (yours, then
 * the ones around you). Inside a group: by start time, cancelled ones last.
 */
export async function eventDay(
  viewerId: string,
  at: GeoPoint,
  input: Filters & { date: string },
  now = new Date(),
): Promise<EventDay> {
  const filters = await filterSql(viewerId, at, input);
  const rows = await selectCards(
    viewerId,
    at,
    Prisma.sql`${Prisma.join(filters, ' AND ')} AND ${startsOnSql(input.date, addDays(input.date, 1))}`,
    Prisma.sql`ORDER BY s."startsAt", e.title, e.id LIMIT 300`,
  );
  const groups = new Map<string, EventDayGroup & { nearest: number }>();
  for (const r of rows) {
    const key = `${r.neighborhood ?? ''}|${r.zip ?? ''}`;
    const g = groups.get(key) ?? {
      neighborhood: r.neighborhood,
      zip: r.zip,
      events: [],
      nearest: Infinity,
    };
    g.events.push(toCard(r, now));
    g.nearest = Math.min(g.nearest, r.meters);
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort(
    (a, b) => a.nearest - b.nearest || (a.neighborhood ?? '').localeCompare(b.neighborhood ?? ''),
  );
  return {
    date: input.date,
    today: localDate(now),
    groups: sorted.map(({ nearest: _n, ...g }) => ({
      ...g,
      events: [...g.events].sort((a, b) => Number(a.cancelled) - Number(b.cancelled)),
    })),
  };
}

/** The list view: sessions that haven't ended, soonest first, a page at a time. */
export async function eventList(
  viewerId: string,
  at: GeoPoint,
  input: Filters & { cursor?: string; limit: number },
  now = new Date(),
): Promise<EventPage> {
  const filters = await filterSql(viewerId, at, input);
  filters.push(Prisma.sql`s."endsAt" > ${now}`);
  const c = decodeCursor(input.cursor);
  if (c && 't' in c) {
    filters.push(Prisma.sql`(s."startsAt", s.id) > (${new Date(c.t)}::timestamptz, ${c.id}::uuid)`);
  }
  const rows = await selectCards(
    viewerId,
    at,
    Prisma.join(filters, ' AND '),
    Prisma.sql`ORDER BY s."startsAt", s.id LIMIT ${input.limit + 1}`,
  );
  const more = rows.length > input.limit;
  const items = rows.slice(0, input.limit);
  const last = items[items.length - 1];
  return {
    items: items.map((r) => toCard(r, now)),
    nextCursor:
      more && last ? encodeCursor({ t: last.starts_at.toISOString(), id: last.session_id }) : null,
  };
}

/**
 * An event's page: its next session (or its last, once it's over) as the card, the sessions
 * still to come, pictures and the follower count (from `events.followerCountMin`). Events
 * stay readable `events.pastVisibleDays` after they end.
 */
export async function eventDetail(
  viewerId: string,
  at: GeoPoint,
  id: string,
  now = new Date(),
): Promise<EventDetail> {
  const pastDays = await getConfig('events.pastVisibleDays');
  const [row] = await selectCards(
    viewerId,
    at,
    Prisma.sql`e.id = ${id}::uuid AND ${VISIBLE}
      AND e."lastEndsAt" > ${new Date(now.getTime() - pastDays * 86_400_000)}`,
    Prisma.sql`ORDER BY (s."endsAt" > ${now}) DESC, CASE WHEN s."endsAt" > ${now} THEN s."startsAt" END ASC,
               s."startsAt" DESC LIMIT 1`,
  );
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Event not found');
  const [event, sessions, images, followers, min] = await Promise.all([
    db.event.findUniqueOrThrow({
      where: { id },
      select: {
        description: true,
        address: true,
        latitude: true,
        longitude: true,
        linkUrl: true,
        linkLabel: true,
        businessAccountId: true,
      },
    }),
    db.eventSession.findMany({
      where: { eventId: id, endsAt: { gt: now } },
      orderBy: { startsAt: 'asc' },
      take: 60,
    }),
    db.eventImage.findMany({
      where: { eventId: id },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    }),
    db.eventFollow.count({ where: { eventId: id } }),
    getConfig('events.followerCountMin'),
  ]);
  return {
    ...toCard(row, now),
    description: event.description,
    address: event.address,
    latitude: event.latitude!,
    longitude: event.longitude!,
    sessions: sessions.map((s) => ({
      id: s.id,
      date: localDate(s.startsAt),
      startTime: localTime(s.startsAt),
      endTime: localTime(s.endsAt),
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
    })),
    images: images.map((i) => ({
      id: i.id,
      url: signedEventImageUrl(i.id, now),
      width: i.width,
      height: i.height,
    })),
    followerCount: followers >= min ? followers : null,
    link: await eventLink(event, now),
  };
}

/** D236: the host's link button, only while its plan allows links (a downgrade hides it). */
async function eventLink(
  e: { linkUrl: string | null; linkLabel: string | null; businessAccountId: string | null },
  now: Date,
) {
  if (!e.linkUrl || !e.linkLabel || !e.businessAccountId) return null;
  const { entitlements } = await entitlementsFor(e.businessAccountId, now);
  return entitlements['ads.links'] ? { url: e.linkUrl, label: e.linkLabel } : null;
}

/**
 * D241: "Coming up": events this person follows that start today or tomorrow (Jacksonville
 * days) and haven't ended, soonest first (cancelled ones included, marked). For the strip on
 * Home and the top of the Events tab.
 */
export async function eventsComingUp(
  viewerId: string,
  at: GeoPoint,
  now = new Date(),
): Promise<EventCard[]> {
  const filters = await filterSql(viewerId, at, { following: true });
  const today = localDate(now);
  filters.push(
    Prisma.sql`s."endsAt" > ${now} AND s."startsAt" < ${localToUtc(addDays(today, 2), '00:00')}`,
  );
  const rows = await selectCards(
    viewerId,
    at,
    Prisma.join(filters, ' AND '),
    Prisma.sql`ORDER BY s."startsAt", s.id LIMIT 10`,
  );
  return rows.map((r) => toCard(r, now));
}
