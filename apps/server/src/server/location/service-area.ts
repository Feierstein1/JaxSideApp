import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@/generated/prisma/client';

/** The committed boundary file (P2.1). See docs/DATA_SOURCES.md. */
export const DUVAL_BOUNDARY_FILE = path.resolve(
  import.meta.dirname,
  '../../../data/boundaries/duval-county.geojson',
);

export interface BoundaryFeature {
  type: 'Feature';
  properties: {
    key: string;
    name: string;
    sourceUrl: string;
    sourceVersion: string;
    license: string;
  };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
}

export function readBoundaryFile(file = DUVAL_BOUNDARY_FILE): BoundaryFeature {
  const feature = JSON.parse(readFileSync(file, 'utf8')) as BoundaryFeature;
  if (feature.type !== 'Feature' || !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)) {
    throw new Error(`${file} is not a Polygon/MultiPolygon GeoJSON Feature`);
  }
  return feature;
}

/**
 * Upserts a service-area polygon by key (P2.2). Idempotent: re-running replaces the
 * geometry and metadata of the same row. ST_MakeValid guards against self-touching
 * rings; ST_Multi normalizes to the column's MultiPolygon type.
 */
export async function importServiceArea(db: PrismaClient, feature: BoundaryFeature) {
  const p = feature.properties;
  const geojson = JSON.stringify(feature.geometry);
  await db.$executeRaw`
    INSERT INTO "ServiceArea" (id, key, name, "sourceUrl", "sourceVersion", license, active, geom, "importedAt")
    VALUES (gen_random_uuid(), ${p.key}, ${p.name}, ${p.sourceUrl}, ${p.sourceVersion}, ${p.license}, true,
            ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326)), 3))::geography,
            now())
    ON CONFLICT (key) DO UPDATE SET
      name = EXCLUDED.name, "sourceUrl" = EXCLUDED."sourceUrl",
      "sourceVersion" = EXCLUDED."sourceVersion", license = EXCLUDED.license,
      geom = EXCLUDED.geom, "importedAt" = now()`;
}

/**
 * Point-in-polygon against active service areas (§6.1, D15). Coordinates are WGS84.
 * ST_Covers counts a point exactly on the boundary line as inside.
 */
export async function isInServiceArea(
  db: PrismaClient,
  latitude: number,
  longitude: number,
): Promise<boolean> {
  const rows = await db.$queryRaw<{ inside: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM "ServiceArea"
      WHERE active
        AND ST_Covers(geom, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography)
    ) AS inside`;
  return rows[0]?.inside ?? false;
}
