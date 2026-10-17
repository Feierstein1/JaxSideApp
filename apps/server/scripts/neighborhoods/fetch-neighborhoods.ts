/**
 * D72: builds data/neighborhoods/duval-neighborhoods.json, the named points used for the
 * "Near Avondale" label. Merges three free sources, keeps only points inside the committed
 * Duval boundary, and drops duplicates. The result is committed, so the app never calls
 * these services at run time. Re-run to refresh:
 *
 *   npm run fetch:neighborhoods -w @jax/server
 *
 * Sources (see docs/DATA_SOURCES.md):
 *  1. data/neighborhoods/additions.json: our own pins for places the others miss. These win.
 *  2. OpenStreetMap (Overpass): place=neighbourhood/suburb/quarter/hamlet/village/town. ODbL.
 *  3. City of Jacksonville GIS, "Neighborhood Names" points (Q16: reuse terms unconfirmed).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readBoundaryFile } from '../../src/server/location/boundary-file';

const DATA = path.resolve(import.meta.dirname, '../../data/neighborhoods');
const OVERPASS_URL = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';
const COJ_URL =
  'https://maps.coj.net/coj/rest/services/Promises/PromisesKept/MapServer/21/query' +
  '?where=1%3D1&outFields=Neighborhoods_WKpoints_OBJ_NAME&returnGeometry=true&outSR=4326&f=json';
const USER_AGENT = 'JaxApp-neighborhoods/0.1 (development; Jacksonville local app)';
// Same name closer than this is the same neighborhood listed twice.
const SAME_PLACE_METERS = 2000;

interface Point {
  name: string;
  lat: number;
  lon: number;
  source: 'local' | 'osm' | 'coj';
}

type Ring = [number, number][];

function inRing([x, y]: [number, number], ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Point-in-(Multi)Polygon, holes respected. */
function makeInsideDuval() {
  const { geometry } = readBoundaryFile();
  const polys = (
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  ) as Ring[][];
  return (p: Point) =>
    polys.some(
      ([outer, ...holes]) =>
        inRing([p.lon, p.lat], outer!) && !holes.some((h) => inRing([p.lon, p.lat], h)),
    );
}

export function meters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

const key = (name: string) =>
  name
    .toLowerCase()
    .replace(/^st\.? /, 'saint ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

async function fromOsm(): Promise<Point[]> {
  const query =
    '[out:json][timeout:60];area["name"="Duval County"]["admin_level"="6"]->.a;' +
    '(nwr["place"~"^(neighbourhood|suburb|quarter|hamlet|village|town)$"](area.a););' +
    'out center tags;';
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) throw new Error(`Overpass: HTTP ${res.status}`);
  const body = (await res.json()) as {
    elements: {
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: { name?: string; place?: string };
    }[];
  };
  // Neighbourhoods first so they win a tie with a same-named hamlet.
  const rank = (p?: string) => (p === 'neighbourhood' || p === 'suburb' || p === 'quarter' ? 0 : 1);
  return body.elements
    .filter((e) => e.tags?.name)
    .sort((a, b) => rank(a.tags?.place) - rank(b.tags?.place))
    .map((e) => ({
      name: e.tags!.name!,
      lat: e.lat ?? e.center!.lat,
      lon: e.lon ?? e.center!.lon,
      source: 'osm' as const,
    }));
}

async function fromCoj(): Promise<Point[]> {
  const res = await fetch(COJ_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`COJ GIS: HTTP ${res.status}`);
  const body = (await res.json()) as {
    features: { attributes: Record<string, string>; geometry: { x: number; y: number } }[];
  };
  return body.features.map((f) => ({
    name: f.attributes.Neighborhoods_WKpoints_OBJ_NAME!,
    lat: f.geometry.y,
    lon: f.geometry.x,
    source: 'coj' as const,
  }));
}

async function main() {
  const local = (
    JSON.parse(readFileSync(path.join(DATA, 'additions.json'), 'utf8')) as {
      neighborhoods: Omit<Point, 'source'>[];
    }
  ).neighborhoods.map((p) => ({ ...p, source: 'local' as const }));
  const [osm, coj] = await Promise.all([fromOsm(), fromCoj()]);
  const insideDuval = makeInsideDuval();

  const kept: Point[] = [];
  const skipped = { outside: 0, duplicate: 0, notArea: 0 };
  for (const p of [...local, ...osm, ...coj]) {
    const name = p.name.trim();
    if (/cemetery|colonia/i.test(name)) {
      skipped.notArea++;
    } else if (!insideDuval(p)) {
      skipped.outside++; // e.g. Duval County, Texas also matches the OSM area name
    } else if (kept.some((k) => key(k.name) === key(name) && meters(k, p) < SAME_PLACE_METERS)) {
      skipped.duplicate++;
    } else {
      kept.push({
        name,
        lat: Math.round(p.lat * 1e5) / 1e5,
        lon: Math.round(p.lon * 1e5) / 1e5,
        source: p.source,
      });
    }
  }
  kept.sort((a, b) => a.name.localeCompare(b.name));

  const out = {
    about:
      'Named neighborhood points in Duval County for the "Near …" label (D72). Generated by ' +
      'scripts/neighborhoods/fetch-neighborhoods.ts; edit additions.json, not this file.',
    sources: {
      local: 'data/neighborhoods/additions.json (our own pins)',
      osm: '© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)',
      coj: 'City of Jacksonville GIS, Neighborhood Names (maps.coj.net)',
    },
    retrieved: new Date().toISOString().slice(0, 10),
    neighborhoods: kept,
  };
  writeFileSync(
    path.join(DATA, 'duval-neighborhoods.json'),
    JSON.stringify(out, null, 1).replace(
      /\{\n\s+("name"[^}]*?)\n\s+\}/g,
      (_, body: string) => `{ ${body.replace(/\n\s+/g, ' ')} }`,
    ) + '\n',
  );
  const by = (s: Point['source']) => kept.filter((k) => k.source === s).length;
  console.log(
    `Kept ${kept.length} (local ${by('local')}, osm ${by('osm')}, coj ${by('coj')}); ` +
      `skipped ${skipped.outside} outside Duval, ${skipped.duplicate} duplicates, ` +
      `${skipped.notArea} not neighborhoods`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
