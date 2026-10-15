/**
 * OpenStreetMap directory import (P2.10–P2.12, §9.1). Data © OpenStreetMap contributors,
 * licensed ODbL: the attribution must be shown wherever places are displayed.
 */
import { Prisma, type PrismaClient } from '@/generated/prisma/client';

export const OSM_SOURCE = 'osm';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

/**
 * Public-facing destinations only (§2, §9.1): tag value → our category. Anything not
 * listed is ignored, which is how offices, houses and infrastructure stay out.
 * Checked in this order; the first match wins.
 */
const RULES: { key: string; values: Record<string, string> | '*' }[] = [
  {
    key: 'amenity',
    values: {
      restaurant: 'restaurant',
      food_court: 'restaurant',
      fast_food: 'fast_food',
      cafe: 'cafe',
      ice_cream: 'dessert',
      bar: 'bar',
      pub: 'bar',
      biergarten: 'bar',
      nightclub: 'nightlife',
      cinema: 'entertainment',
      theatre: 'entertainment',
      arts_centre: 'arts',
      library: 'library',
      marketplace: 'market',
      community_centre: 'community',
      pharmacy: 'pharmacy',
      fuel: 'gas_station',
      car_wash: 'automotive',
      bank: 'bank',
      post_office: 'post_office',
    },
  },
  {
    key: 'tourism',
    values: {
      attraction: 'attraction',
      museum: 'museum',
      gallery: 'arts',
      zoo: 'attraction',
      aquarium: 'attraction',
      theme_park: 'attraction',
      viewpoint: 'attraction',
      hotel: 'lodging',
      motel: 'lodging',
    },
  },
  {
    key: 'leisure',
    values: {
      park: 'park',
      dog_park: 'park',
      nature_reserve: 'park',
      sports_centre: 'fitness',
      fitness_centre: 'fitness',
      stadium: 'venue',
      golf_course: 'golf',
      marina: 'marina',
      water_park: 'attraction',
      bowling_alley: 'entertainment',
      amusement_arcade: 'entertainment',
    },
  },
  { key: 'shop', values: '*' },
  { key: 'natural', values: { beach: 'beach' } },
];

const SHOP_GROUPS: Record<string, string> = {
  supermarket: 'grocery',
  convenience: 'convenience',
  greengrocer: 'grocery',
  butcher: 'grocery',
  deli: 'grocery',
  bakery: 'bakery',
  car: 'car_dealer',
  motorcycle: 'car_dealer',
  car_repair: 'automotive',
  car_parts: 'automotive',
  tyres: 'automotive',
  mall: 'mall',
  department_store: 'shopping',
};
const SHOP_EXCLUDED = new Set(['vacant', 'no', 'yes_but_closed']);

/** Every category the importer can assign (used to check the app's filter groups). */
export function allCategories(): Set<string> {
  const out = new Set<string>(['shop', ...Object.values(SHOP_GROUPS)]);
  for (const r of RULES) if (r.values !== '*') Object.values(r.values).forEach((c) => out.add(c));
  return out;
}

export function categorize(tags: Record<string, string>): string | null {
  for (const rule of RULES) {
    const v = tags[rule.key];
    if (!v) continue;
    if (rule.values === '*') {
      if (SHOP_EXCLUDED.has(v)) continue;
      return SHOP_GROUPS[v] ?? 'shop';
    }
    const cat = rule.values[v];
    if (cat) return cat;
  }
  return null;
}

/** Overpass QL for the allow-list inside a bounding box (south, west, north, east). */
export function buildOverpassQuery(
  bbox: [number, number, number, number],
  timeoutSeconds = 180,
): string {
  const b = bbox.map((n) => n.toFixed(5)).join(',');
  const parts = RULES.map((r) =>
    r.values === '*'
      ? `nwr["${r.key}"]["${r.key}"!~"^(${[...SHOP_EXCLUDED].join('|')})$"]["name"](${b});`
      : `nwr["${r.key}"~"^(${Object.keys(r.values).join('|')})$"]["name"](${b});`,
  );
  return `[out:json][timeout:${timeoutSeconds}];\n(\n  ${parts.join('\n  ')}\n);\nout center tags;`;
}

/**
 * Name normalization for search and duplicate detection: case, accents, "&" vs "and",
 * punctuation and a leading "The" don't matter.
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface PlaceCandidate {
  sourceId: string;
  rank: number; // node 0, way 1, relation 2: nodes win duplicate ties
  osmId: number;
  name: string;
  nameNormalized: string;
  category: string;
  address: string | null;
  latitude: number;
  longitude: number;
}

function address(t: Record<string, string>): string | null {
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  const parts = [street, t['addr:city'], t['addr:postcode']].filter(Boolean);
  return parts.length ? parts.join(', ').slice(0, 300) : null;
}

/** Turns raw Overpass elements into importable places (named + allow-listed + located). */
export function toCandidates(elements: OsmElement[]): PlaceCandidate[] {
  const out: PlaceCandidate[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags.name?.trim();
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!name || lat === undefined || lon === undefined) continue;
    const category = categorize(tags);
    if (!category) continue;
    const nameNormalized = normalizeName(name);
    if (!nameNormalized) continue;
    out.push({
      sourceId: `${el.type}/${el.id}`,
      rank: el.type === 'node' ? 0 : el.type === 'way' ? 1 : 2,
      osmId: el.id,
      name: name.slice(0, 200),
      nameNormalized: nameNormalized.slice(0, 200),
      category,
      address: address(tags),
      latitude: lat,
      longitude: lon,
    });
  }
  return out;
}

export interface ImportReport {
  candidates: number;
  outsideArea: number;
  duplicates: number;
  inserted: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  deactivationSkipped: boolean;
}

/** Same name within this distance = the same place (P2.11). */
const DUPLICATE_METERS = 50;
/**
 * Don't deactivate missing places if this run found fewer than this share of the
 * currently active OSM places. Protects against a truncated download.
 */
const MIN_SHARE_FOR_DEACTIVATION = 0.5;

/**
 * Idempotent upsert of OSM places (P2.11). Runs in one transaction:
 * stage → drop outside Duval → drop duplicates (within the batch and against other
 * sources) → upsert by (sourceName, sourceId) → deactivate OSM places no longer present.
 */
export async function importOsmPlaces(
  db: PrismaClient,
  elements: OsmElement[],
): Promise<ImportReport> {
  const candidates = toCandidates(elements);
  return db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`
        CREATE TEMP TABLE osm_stage (
          source_id text PRIMARY KEY, rank int, osm_id bigint, name text, name_norm text,
          category text, address text, lat double precision, lng double precision,
          geog geography(Point, 4326)
        ) ON COMMIT DROP`);
      for (let i = 0; i < candidates.length; i += 500) {
        const rows = candidates.slice(i, i + 500).map(
          (c) => Prisma.sql`(${c.sourceId}, ${c.rank}, ${c.osmId}, ${c.name}, ${c.nameNormalized},
            ${c.category}, ${c.address}, ${c.latitude}, ${c.longitude},
            ST_SetSRID(ST_MakePoint(${c.longitude}, ${c.latitude}), 4326)::geography)`,
        );
        await tx.$executeRaw`
          INSERT INTO osm_stage VALUES ${Prisma.join(rows)} ON CONFLICT (source_id) DO NOTHING`;
      }

      const outsideArea = await tx.$executeRaw`
        DELETE FROM osm_stage s WHERE NOT EXISTS (
          SELECT 1 FROM "ServiceArea" a WHERE a.active AND ST_Covers(a.geom, s.geog))`;

      // Same normalized name within 50 m: keep nodes over ways over relations, then lowest ID.
      const dupInBatch = await tx.$executeRaw`
        DELETE FROM osm_stage s USING osm_stage k
        WHERE s.name_norm = k.name_norm AND s.source_id <> k.source_id
          AND ST_DWithin(s.geog, k.geog, ${DUPLICATE_METERS})
          AND (k.rank, k.osm_id) < (s.rank, s.osm_id)`;
      // Already in the directory from another source (e.g. an approved submission).
      const dupOtherSource = await tx.$executeRaw`
        DELETE FROM osm_stage s USING "BusinessPlace" p
        WHERE p."sourceName" <> ${OSM_SOURCE} AND p.status = 'ACTIVE'
          AND p."nameNormalized" = s.name_norm
          AND ST_DWithin(p.location, s.geog, ${DUPLICATE_METERS})`;

      const [counts] = await tx.$queryRaw<{ inserted: bigint; updated: bigint }[]>`
        WITH up AS (
          INSERT INTO "BusinessPlace" (id, name, "nameNormalized", category, address, latitude,
                                       longitude, location, status, "sourceName", "sourceId",
                                       attribution, "createdAt", "updatedAt")
          SELECT gen_random_uuid(), name, name_norm, category, address, lat, lng, geog, 'ACTIVE',
                 ${OSM_SOURCE}, source_id, ${OSM_ATTRIBUTION}, now(), now()
          FROM osm_stage
          ON CONFLICT ("sourceName", "sourceId") DO UPDATE SET
            name = EXCLUDED.name, "nameNormalized" = EXCLUDED."nameNormalized",
            category = EXCLUDED.category, address = EXCLUDED.address,
            latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
            location = EXCLUDED.location, status = 'ACTIVE', "updatedAt" = now()
          WHERE "BusinessPlace".name IS DISTINCT FROM EXCLUDED.name
             OR "BusinessPlace".category IS DISTINCT FROM EXCLUDED.category
             OR "BusinessPlace".address IS DISTINCT FROM EXCLUDED.address
             OR "BusinessPlace".latitude IS DISTINCT FROM EXCLUDED.latitude
             OR "BusinessPlace".longitude IS DISTINCT FROM EXCLUDED.longitude
             OR "BusinessPlace".status <> 'ACTIVE'
          RETURNING (xmax = 0) AS inserted
        )
        SELECT count(*) FILTER (WHERE inserted) AS inserted,
               count(*) FILTER (WHERE NOT inserted) AS updated
        FROM up`;
      const stagedRows = await tx.$queryRaw<{ staged: bigint }[]>`
        SELECT count(*) AS staged FROM osm_stage`;
      const activeRows = await tx.$queryRaw<{ active: bigint }[]>`
        SELECT count(*) AS active FROM "BusinessPlace"
        WHERE "sourceName" = ${OSM_SOURCE} AND status = 'ACTIVE'`;

      const staged = Number(stagedRows[0]?.staged ?? 0);
      const active = Number(activeRows[0]?.active ?? 0);
      let deactivated = 0;
      const deactivationSkipped = staged < active * MIN_SHARE_FOR_DEACTIVATION;
      if (!deactivationSkipped) {
        deactivated = await tx.$executeRaw`
          UPDATE "BusinessPlace" SET status = 'INACTIVE', "updatedAt" = now()
          WHERE "sourceName" = ${OSM_SOURCE} AND status = 'ACTIVE'
            AND "sourceId" NOT IN (SELECT source_id FROM osm_stage)`;
      }

      const inserted = Number(counts?.inserted ?? 0);
      const updated = Number(counts?.updated ?? 0);
      return {
        candidates: candidates.length,
        outsideArea,
        duplicates: dupInBatch + dupOtherSource,
        inserted,
        updated,
        unchanged: staged - inserted - updated,
        deactivated,
        deactivationSkipped,
      };
    },
    { timeout: 300_000 },
  );
}

/** Bounding box of the active service area(s): [south, west, north, east]. */
export async function serviceAreaBbox(db: PrismaClient): Promise<[number, number, number, number]> {
  const [r] = await db.$queryRaw<{ s: number; w: number; n: number; e: number }[]>`
    SELECT ST_YMin(x) AS s, ST_XMin(x) AS w, ST_YMax(x) AS n, ST_XMax(x) AS e
    FROM (SELECT ST_Extent(geom::geometry) AS x FROM "ServiceArea" WHERE active) q`;
  if (!r || r.s === null) throw new Error('No active service area; run the boundary import first');
  return [r.s, r.w, r.n, r.e];
}
