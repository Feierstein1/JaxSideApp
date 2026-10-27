import { milesToMeters, type PlaceSort, type PlaceSummary } from '@jax/shared';
import { Prisma } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { normalizeName } from './osm';
import { ratingFromCounts } from './ratings';

interface Row {
  id: string;
  name: string;
  category: string;
  address: string | null;
  latitude: number;
  longitude: number;
  distance: number;
  is_favorite: boolean;
  post_count: number;
  favorite_count: number;
  like_count: number;
  dislike_count: number;
  ratings_locked: boolean;
  my_rating: number | null;
}

async function toSummaries(rows: Row[]): Promise<PlaceSummary[]> {
  const roomMeters = milesToMeters(await getConfig('radius.business.maxMiles'));
  const minVotes = await getConfig('places.ratingMinVotes');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    address: r.address,
    latitude: r.latitude,
    longitude: r.longitude,
    // Rounded: a nearby list needs "about how far", not survey precision.
    distanceMeters: Math.round(r.distance / 10) * 10,
    isFavorite: r.is_favorite,
    withinRoomRadius: r.distance <= roomMeters,
    postCount: r.post_count,
    favoriteCount: r.favorite_count,
    // D144: % liked once enough people voted (counts kept on the place, one vote each).
    rating: ratingFromCounts(r.like_count, r.dislike_count, minVotes),
    myRating: (r.my_rating ?? 0) as -1 | 0 | 1,
    ratingsLocked: r.ratings_locked,
  }));
}

/** D144: the place columns and your own vote, shared by the list and the place page. */
const ratingColumns = (userId: string) => Prisma.sql`
  p."likeCount" AS like_count, p."dislikeCount" AS dislike_count,
  (p."ratingsLockedAt" IS NOT NULL) AS ratings_locked,
  (SELECT pr.value FROM "PlaceRating" pr
    WHERE pr."placeId" = p.id AND pr."userId" = ${userId}::uuid) AS my_rating`;

/**
 * Directory search (P2.13, D40).
 * - Filters: name (typo-tolerant, pg_trgm), category list.
 * - Sorts: "relevance" (best name match, default when searching), "distance" (default
 *   otherwise), "name" (A–Z), "favorites" (favorites first, then distance), "popular"
 *   (most favorited by everyone, D74).
 * - In the distance-based sorts, favorites rank as if closer by
 *   directory.favoriteDistanceFactor, so they stand out without overriding distance (D39).
 */
export async function searchPlaces(opts: {
  userId: string;
  latitude: number;
  longitude: number;
  q?: string;
  categories?: string[];
  sort?: PlaceSort;
  limit?: number;
  offset: number;
  /** D71: the person's radius; the list never reaches past it (or the server maximum). */
  radiusMiles?: number | null;
}): Promise<{ places: PlaceSummary[]; nextOffset: number | null }> {
  const [defaultPageSize, favFactor, maxMiles, maxName, minVotes] = await Promise.all([
    getConfig('directory.pageSize'),
    getConfig('directory.favoriteDistanceFactor'),
    getConfig('directory.maxListMiles'),
    getConfig('directory.maxNameLength'),
    getConfig('places.ratingMinVotes'),
  ]);
  const pageSize = opts.limit ?? defaultPageSize;
  const me = Prisma.sql`ST_SetSRID(ST_MakePoint(${opts.longitude}, ${opts.latitude}), 4326)::geography`;
  const q = opts.q ? normalizeName(opts.q) : '';
  const nameFilter = q
    ? Prisma.sql`AND (p."nameNormalized" % ${q}::text OR p."nameNormalized" LIKE ${'%' + q + '%'}::text)`
    : Prisma.empty;
  const categoryFilter = opts.categories?.length
    ? Prisma.sql`AND p.category IN (${Prisma.join(opts.categories)})`
    : Prisma.empty;
  const distance = Prisma.sql`ST_Distance(p.location, ${me})`;
  const effectiveDistance = Prisma.sql`
    ${distance} * CASE WHEN f."userId" IS NULL THEN 1.0 ELSE ${favFactor}::float8 END`;
  const sort = opts.sort ?? (q ? 'relevance' : 'distance');
  const order = {
    relevance: q
      ? Prisma.sql`ORDER BY round(similarity(p."nameNormalized", ${q}::text)::numeric, 1) DESC, ${effectiveDistance} ASC, p.id`
      : Prisma.sql`ORDER BY ${effectiveDistance} ASC, p.id`,
    distance: Prisma.sql`ORDER BY ${effectiveDistance} ASC, p.id`,
    name: Prisma.sql`ORDER BY p."nameNormalized" ASC, ${distance} ASC, p.id`,
    favorites: Prisma.sql`ORDER BY (f."userId" IS NULL) ASC, ${distance} ASC, p.id`,
    // D74: most favorited first; ties nearest first.
    popular: Prisma.sql`ORDER BY favorite_count DESC, ${distance} ASC, p.id`,
    // D144: places with a shown rating first, highest % liked, then most votes, then nearest.
    liked: Prisma.sql`ORDER BY (p."likeCount" + p."dislikeCount" >= ${minVotes}) DESC,
      p."likeCount"::float8 / NULLIF(p."likeCount" + p."dislikeCount", 0) DESC NULLS LAST,
      p."likeCount" + p."dislikeCount" DESC, ${distance} ASC, p.id`,
  }[sort];

  const rows = await db.$queryRaw<Row[]>`
    SELECT p.id, p.name, p.category, p.address, p.latitude, p.longitude, p."postCount" AS post_count,
           (SELECT count(*)::int FROM "FavoritePlace" fc WHERE fc."placeId" = p.id) AS favorite_count,
           ${distance} AS distance, ${ratingColumns(opts.userId)},
           (f."userId" IS NOT NULL) AS is_favorite
    FROM "BusinessPlace" p
    LEFT JOIN "FavoritePlace" f ON f."placeId" = p.id AND f."userId" = ${opts.userId}::uuid
    WHERE p.status = 'ACTIVE' ${nameFilter} ${categoryFilter}
      -- D69: only places within a mile, and only names that fit on one line.
      AND ST_DWithin(p.location, ${me}, ${Math.min(maxMiles, opts.radiusMiles ?? maxMiles) * 1609.344})
      AND char_length(p.name) <= ${maxName}
    ${order}
    LIMIT ${pageSize + 1} OFFSET ${opts.offset}`;

  const more = rows.length > pageSize;
  return {
    places: await toSummaries(rows.slice(0, pageSize)),
    nextOffset: more && opts.offset + pageSize <= 200 ? opts.offset + pageSize : null,
  };
}

/** One active place with distance from the user, or 404. */
export async function getPlace(opts: {
  userId: string;
  placeId: string;
  latitude: number;
  longitude: number;
}): Promise<PlaceSummary> {
  const me = Prisma.sql`ST_SetSRID(ST_MakePoint(${opts.longitude}, ${opts.latitude}), 4326)::geography`;
  const rows = await db.$queryRaw<Row[]>`
    SELECT p.id, p.name, p.category, p.address, p.latitude, p.longitude, p."postCount" AS post_count,
           (SELECT count(*)::int FROM "FavoritePlace" fc WHERE fc."placeId" = p.id) AS favorite_count,
           ST_Distance(p.location, ${me}) AS distance, ${ratingColumns(opts.userId)},
           (f."userId" IS NOT NULL) AS is_favorite
    FROM "BusinessPlace" p
    LEFT JOIN "FavoritePlace" f ON f."placeId" = p.id AND f."userId" = ${opts.userId}::uuid
    WHERE p.id = ${opts.placeId}::uuid AND p.status = 'ACTIVE'`;
  if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Place not found');
  return (await toSummaries(rows))[0]!;
}

/** P2.14: add a favorite (idempotent). */
export async function addFavorite(userId: string, placeId: string): Promise<void> {
  const place = await db.businessPlace.findFirst({
    where: { id: placeId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found');
  const existing = await db.favoritePlace.findUnique({
    where: { userId_placeId: { userId, placeId } },
  });
  if (existing) return;
  const max = await getConfig('favorites.maxPerUser');
  if ((await db.favoritePlace.count({ where: { userId } })) >= max) {
    throw new ApiError(409, 'FAVORITES_FULL', `You can save up to ${max} favorites.`);
  }
  // skipDuplicates makes a double-tap race harmless (unique (user, place)).
  await db.favoritePlace.createMany({ data: [{ userId, placeId }], skipDuplicates: true });
}

export async function removeFavorite(userId: string, placeId: string): Promise<void> {
  await db.favoritePlace.deleteMany({ where: { userId, placeId } });
}

export async function listFavorites(userId: string) {
  const favs = await db.favoritePlace.findMany({
    where: { userId, place: { status: 'ACTIVE' } },
    orderBy: { createdAt: 'desc' },
    select: { place: { select: { id: true, name: true, category: true, address: true } } },
  });
  return favs.map((f) => f.place);
}
