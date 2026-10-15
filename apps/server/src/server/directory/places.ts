import { milesToMeters, type PlaceSummary } from '@jax/shared';
import { Prisma } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { normalizeName } from './osm';

interface Row {
  id: string;
  name: string;
  category: string;
  address: string | null;
  latitude: number;
  longitude: number;
  distance: number;
  is_favorite: boolean;
}

async function toSummaries(rows: Row[]): Promise<PlaceSummary[]> {
  const roomMeters = milesToMeters(await getConfig('radius.business.maxMiles'));
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
  }));
}

/**
 * Directory search (P2.13). With `q`: typo-tolerant name match (pg_trgm), best matches
 * first. Without `q`: nearest first. Either way favorites rank as if closer by
 * directory.favoriteDistanceFactor, so they stand out without overriding distance (D39).
 */
export async function searchPlaces(opts: {
  userId: string;
  latitude: number;
  longitude: number;
  q?: string;
  category?: string;
  offset: number;
}): Promise<{ places: PlaceSummary[]; nextOffset: number | null }> {
  const [pageSize, favFactor] = await Promise.all([
    getConfig('directory.pageSize'),
    getConfig('directory.favoriteDistanceFactor'),
  ]);
  const me = Prisma.sql`ST_SetSRID(ST_MakePoint(${opts.longitude}, ${opts.latitude}), 4326)::geography`;
  const q = opts.q ? normalizeName(opts.q) : '';
  const nameFilter = q
    ? Prisma.sql`AND (p."nameNormalized" % ${q}::text OR p."nameNormalized" LIKE ${'%' + q + '%'}::text)`
    : Prisma.empty;
  const categoryFilter = opts.category
    ? Prisma.sql`AND p.category = ${opts.category}`
    : Prisma.empty;
  const effectiveDistance = Prisma.sql`
    ST_Distance(p.location, ${me}) * CASE WHEN f."userId" IS NULL THEN 1.0 ELSE ${favFactor}::float8 END`;
  const order = q
    ? Prisma.sql`ORDER BY round(similarity(p."nameNormalized", ${q}::text)::numeric, 1) DESC, ${effectiveDistance} ASC, p.id`
    : Prisma.sql`ORDER BY ${effectiveDistance} ASC, p.id`;

  const rows = await db.$queryRaw<Row[]>`
    SELECT p.id, p.name, p.category, p.address, p.latitude, p.longitude,
           ST_Distance(p.location, ${me}) AS distance,
           (f."userId" IS NOT NULL) AS is_favorite
    FROM "BusinessPlace" p
    LEFT JOIN "FavoritePlace" f ON f."placeId" = p.id AND f."userId" = ${opts.userId}::uuid
    WHERE p.status = 'ACTIVE' ${nameFilter} ${categoryFilter}
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
    SELECT p.id, p.name, p.category, p.address, p.latitude, p.longitude,
           ST_Distance(p.location, ${me}) AS distance,
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
