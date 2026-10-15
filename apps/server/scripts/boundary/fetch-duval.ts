/**
 * P2.1: Extracts the Duval County boundary from the Census TIGER/Line county file and
 * writes it to data/boundaries/duval-county.geojson (committed, so imports are offline
 * and reproducible). Re-run only to move to a newer TIGER vintage.
 *
 *   npx tsx scripts/boundary/fetch-duval.ts [year]     (default 2026)
 *
 * The download (~83 MB) goes to a fresh temp folder and is deleted afterwards.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import * as shapefile from 'shapefile';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

const DUVAL_GEOID = '12031'; // Florida (12) + Duval County (031)
const year = process.argv[2] ?? '2026';
const url = `https://www2.census.gov/geo/tiger/TIGER${year}/COUNTY/tl_${year}_us_county.zip`;
const outFile = path.resolve(import.meta.dirname, '../../data/boundaries/duval-county.geojson');

async function main() {
  console.log(`Downloading ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const zip = new Uint8Array(await res.arrayBuffer());
  const sha256 = createHash('sha256').update(zip).digest('hex');
  console.log(`Downloaded ${(zip.length / 1e6).toFixed(1)} MB, sha256 ${sha256}`);

  const base = `tl_${year}_us_county`;
  const wanted = new Set([`${base}.shp`, `${base}.dbf`, `${base}.prj`]);
  const files = unzipSync(zip, { filter: (f) => wanted.has(f.name) });
  for (const name of wanted) if (!files[name]) throw new Error(`Missing ${name} in archive`);

  // TIGER/Line is NAD83 geographic (EPSG:4269). Refuse anything else rather than guess.
  const prj = new TextDecoder().decode(files[`${base}.prj`]);
  if (!/GCS_North_American_1983/.test(prj)) throw new Error(`Unexpected projection: ${prj}`);

  // shapefile reads from paths, so write the two files to a private temp folder.
  const dir = mkdtempSync(path.join(tmpdir(), 'jax-tiger-'));
  try {
    const shp = path.join(dir, `${base}.shp`);
    const dbf = path.join(dir, `${base}.dbf`);
    writeFileSync(shp, files[`${base}.shp`]!);
    writeFileSync(dbf, files[`${base}.dbf`]!);

    const source = await shapefile.open(shp, dbf);
    let found: Feature<Polygon | MultiPolygon> | undefined;
    for (let r = await source.read(); !r.done; r = await source.read()) {
      if (r.value.properties?.GEOID === DUVAL_GEOID) {
        found = r.value as Feature<Polygon | MultiPolygon>;
        break;
      }
    }
    if (!found) throw new Error(`GEOID ${DUVAL_GEOID} not found`);

    const p = found.properties ?? {};
    const feature = {
      type: 'Feature',
      properties: {
        key: 'duval',
        name: p.NAMELSAD,
        geoid: p.GEOID,
        landAreaM2: p.ALAND,
        waterAreaM2: p.AWATER,
        source: `US Census Bureau TIGER/Line Shapefiles ${year}, Counties`,
        sourceUrl: url,
        sourceVersion: `TIGER${year}`,
        sourceSha256: sha256,
        datum: 'NAD83 (EPSG:4269); stored as WGS84 (EPSG:4326), difference ~1 m',
        license: 'Public domain (US Government work)',
        retrievedAt: new Date().toISOString().slice(0, 10),
      },
      geometry: found.geometry,
    };
    mkdirSync(path.dirname(outFile), { recursive: true });
    writeFileSync(outFile, JSON.stringify(feature) + '\n');
    const rings =
      found.geometry.type === 'Polygon'
        ? found.geometry.coordinates
        : found.geometry.coordinates.flat();
    const points = rings.reduce((n, ring) => n + ring.length, 0);
    console.log(`Wrote ${outFile}: ${p.NAMELSAD}, ${found.geometry.type}, ${points} points`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
