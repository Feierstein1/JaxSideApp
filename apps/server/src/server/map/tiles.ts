import { createHmac, timingSafeEqual } from 'node:crypto';
import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { getEnv } from '../env';
import { findRepoRoot } from '../repo-root';

/**
 * D99: the Places map, free and Jacksonville-only. The basemap is a Protomaps extract of
 * the Duval area (OpenStreetMap data, ODbL; ~41 MB, zoom 0–15) stored as one PMTiles file
 * and served from our own server in byte ranges. No Google, no keys, no per-view fees.
 * Refresh it with `npm run fetch:map -w @jax/server`.
 */

/** The area the extract covers (a little larger than the county). */
export const MAP_BOUNDS: [number, number, number, number] = [-82.06, 30.09, -81.3, 30.6];
export const MAP_ATTRIBUTION = '© OpenStreetMap contributors · Protomaps';
const LINK_TTL_SECONDS = 86_400;
const WEEK_SECONDS = 7 * 86_400;

export function tilesFile(): string {
  return (
    process.env.MAP_TILES_FILE ?? path.join(findRepoRoot(), 'apps/server/data/map/duval.pmtiles')
  );
}

export async function tilesAvailable(): Promise<boolean> {
  try {
    return (await stat(tilesFile())).size > 0;
  } catch {
    return false;
  }
}

function sig(kind: string, exp: number) {
  return createHmac('sha256', getEnv().SESSION_SECRET)
    .update(`map:${kind}:${exp}`)
    .digest('base64url');
}

/**
 * A signed link. The page's lasts about a day. D113: the tiles' link stays the same for a
 * whole week (and is valid for another), so the phone's web cache keeps the downloaded map
 * for a week instead of fetching it again each hour; `v` changes when the map file does, so
 * a refreshed map isn't stuck behind the cache.
 */
export function signedMapUrl(kind: 'tiles' | 'page', now = new Date(), version?: string) {
  const secs = now.getTime() / 1000;
  const exp =
    kind === 'tiles'
      ? Math.ceil(secs / WEEK_SECONDS) * WEEK_SECONDS + WEEK_SECONDS
      : Math.ceil(secs / 3600) * 3600 + LINK_TTL_SECONDS;
  const v = version ? `&v=${encodeURIComponent(version)}` : '';
  return `/api/v1/map/${kind}?exp=${exp}&sig=${sig(kind, exp)}${v}`;
}

/** D113: changes whenever the map file is replaced (size and modified time). */
export async function tilesVersion(): Promise<string> {
  const info = await stat(tilesFile()).catch(() => null);
  return info ? `${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}` : 'none';
}

export function checkMapSignature(
  kind: 'tiles' | 'page',
  exp: string | null,
  given: string | null,
  now = new Date(),
) {
  const e = Number(exp);
  if (!Number.isInteger(e) || e < now.getTime() / 1000 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(sig(kind, e));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Reads bytes [start, end] (inclusive) of the tiles file, plus its size and an ETag. */
export async function readTilesRange(range: string | null) {
  const file = tilesFile();
  const info = await stat(file);
  const size = info.size;
  const etag = `"${size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range ?? '');
  let start = 0;
  let end = size - 1;
  let partial = false;
  if (m && (m[1] || m[2])) {
    partial = true;
    start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) return { status: 416 as const, size, etag };
  }
  // Whole-file requests are refused: clients read the map in ranges (a 41 MB body isn't useful).
  if (!partial) return { status: 400 as const, size, etag };
  const length = end - start + 1;
  if (length > 16 * 1024 * 1024) return { status: 416 as const, size, etag };
  const fh = await open(file, 'r');
  try {
    const body = Buffer.alloc(length);
    await fh.read(body, 0, length, start);
    return { status: 206 as const, body, start, end, size, etag };
  } finally {
    await fh.close();
  }
}
