import type { PrismaClient } from '@/generated/prisma/client';
import type { BoundaryFeature } from './boundary-file';

export type { BoundaryFeature };

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
    VALUES (uuid_v7(), ${p.key}, ${p.name}, ${p.sourceUrl}, ${p.sourceVersion}, ${p.license}, true,
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
