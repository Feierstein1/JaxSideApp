/**
 * P2.10: imports public-facing places in Duval County from OpenStreetMap.
 *
 *   npm run import:places -w @jax/server                    # download + import
 *   npm run import:places -w @jax/server -- --from-file X   # re-import a saved download
 *
 * One Overpass request per run (respecting the public server's usage policy). The raw
 * response is saved to data/osm/ (git-ignored) so a run can be repeated offline.
 * Data © OpenStreetMap contributors, ODbL. See docs/DATA_SOURCES.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { db } from '../../src/server/db';
import {
  buildOverpassQuery,
  importOsmPlaces,
  serviceAreaBbox,
  type OsmElement,
} from '../../src/server/directory/osm';

const OVERPASS_URL = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';
const CACHE_DIR = path.resolve(import.meta.dirname, '../../data/osm');
const TILE_GRID = 4; // 4 x 4 = 16 small requests
const PAUSE_MS = 5_000; // between requests, to be polite to the public server

/** Splits [south, west, north, east] into an n x n grid of tiles. */
function splitBbox(
  [s, w, n, e]: [number, number, number, number],
  grid: number,
): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const dLat = (n - s) / grid;
  const dLng = (e - w) / grid;
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      out.push([s + r * dLat, w + c * dLng, s + (r + 1) * dLat, w + (c + 1) * dLng]);
    }
  }
  return out;
}

/**
 * The public Overpass server asks clients to back off when it's busy (HTTP 429/502/503/504).
 * Up to 4 attempts, waiting 30 s, 60 s, 120 s (or the server's Retry-After), never hammering.
 */
async function fetchWithBackoff(query: string): Promise<Response> {
  let waitSeconds = 30;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'JaxApp-directory-import/0.1 (development; Jacksonville local directory)',
      },
      body: new URLSearchParams({ data: query }),
    });
    if (res.ok) return res;
    const retryable = [429, 502, 503, 504].includes(res.status);
    if (!retryable || attempt === 4) {
      throw new Error(`Overpass returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const retryAfter = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : waitSeconds;
    console.log(
      `Overpass busy (HTTP ${res.status}); retrying in ${wait}s (attempt ${attempt + 1}/4)`,
    );
    await new Promise((r) => setTimeout(r, wait * 1000));
    waitSeconds *= 2;
  }
}

async function download(): Promise<{ elements: OsmElement[]; file: string }> {
  // One county-wide query is too heavy for the public server, so ask for a grid of
  // small tiles one at a time, pausing between them, and merge the results.
  const tiles = splitBbox(await serviceAreaBbox(db), TILE_GRID);
  const byKey = new Map<string, OsmElement>();
  // Finished tiles are saved per day, so a rerun after a failure only fetches what's missing.
  const tileDir = path.join(CACHE_DIR, `tiles-${new Date().toISOString().slice(0, 10)}`);
  mkdirSync(tileDir, { recursive: true });
  for (const [i, tile] of tiles.entries()) {
    const tileFile = path.join(tileDir, `tile-${TILE_GRID}x${TILE_GRID}-${i}.json`);
    let elements: OsmElement[];
    if (existsSync(tileFile)) {
      elements = (JSON.parse(readFileSync(tileFile, 'utf8')) as { elements: OsmElement[] })
        .elements;
      console.log(`Tile ${i + 1}/${tiles.length}: reused from today's cache`);
    } else {
      console.log(`Tile ${i + 1}/${tiles.length} from ${OVERPASS_URL} ...`);
      const res = await fetchWithBackoff(buildOverpassQuery(tile, 90));
      const json = (await res.json()) as { elements?: OsmElement[]; remark?: string };
      // Overpass reports timeouts in "remark" with HTTP 200; never import a partial result.
      if (json.remark)
        throw new Error(`Overpass remark (result may be incomplete): ${json.remark}`);
      if (!Array.isArray(json.elements)) throw new Error('Unexpected Overpass response');
      elements = json.elements;
      writeFileSync(tileFile, JSON.stringify({ elements }));
      if (i < tiles.length - 1) await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
    // A way crossing a tile edge is returned by both tiles; keep one copy.
    for (const el of elements) byKey.set(`${el.type}/${el.id}`, el);
  }
  const text = JSON.stringify({ elements: [...byKey.values()] });
  const json = { elements: [...byKey.values()] };
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `duval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, text);
  return { elements: json.elements, file };
}

async function main() {
  const i = process.argv.indexOf('--from-file');
  const { elements, file } =
    i > 0
      ? {
          elements: (
            JSON.parse(readFileSync(process.argv[i + 1]!, 'utf8')) as {
              elements: OsmElement[];
            }
          ).elements,
          file: process.argv[i + 1]!,
        }
      : await download();
  console.log(`${elements.length} elements from ${path.basename(file)}`);
  const report = await importOsmPlaces(db, elements);
  console.log('import complete', report);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
