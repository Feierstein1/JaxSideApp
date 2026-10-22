import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@/generated/prisma/client';
import { findRepoRoot } from '../repo-root';

/**
 * D116: ZIP code areas (Census 2020 ZIP Code Tabulation Areas, public domain) around Duval,
 * for the anonymous area counts. Read only by the seed and tests, like the county boundary.
 */
export function zipAreasFile(): string {
  return path.join(findRepoRoot(), 'apps/server/data/boundaries/duval-zcta-2020.geojson');
}

interface ZipFeature {
  properties: { ZCTA5: string };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
}

/** Upserts every ZIP area in the file (idempotent). Returns how many. */
export async function importZipAreas(db: PrismaClient, file = zipAreasFile()): Promise<number> {
  const fc = JSON.parse(readFileSync(file, 'utf8')) as { features: ZipFeature[] };
  for (const f of fc.features) {
    const zip = f.properties.ZCTA5;
    if (!/^\d{5}$/.test(zip)) throw new Error(`Bad ZIP in ${file}: ${zip}`);
    const geojson = JSON.stringify(f.geometry);
    await db.$executeRaw`
      INSERT INTO "ZipArea" (zip, geom)
      VALUES (${zip},
              ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326)), 3))::geography)
      ON CONFLICT (zip) DO UPDATE SET geom = EXCLUDED.geom`;
  }
  return fc.features.length;
}
