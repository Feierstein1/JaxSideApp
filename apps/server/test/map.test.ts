import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as configGET } from '@/app/api/v1/map/route';
import { GET as pageGET } from '@/app/api/v1/map/page/route';
import { GET as tilesGET } from '@/app/api/v1/map/tiles/route';
import { GET as fontGET } from '@/app/api/v1/map/font/route';
import { CATEGORY_ICONS } from '@jax/shared';
import { ICON_GLYPHS } from '@/server/map/icons';
import { signedMapUrl } from '@/server/map/tiles';
import { createSession } from '@/server/auth/sessions';
import { resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D99: the Places map: Duval tiles served from our own server, in signed byte ranges.

const BYTES = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));
let token: string;
const before = process.env.MAP_TILES_FILE;

beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'jax-map-'));
  const file = path.join(dir, 'duval.pmtiles');
  writeFileSync(file, BYTES);
  process.env.MAP_TILES_FILE = file;
  await resetDb();
  token = (await createSession((await createTestUser('map_u')).id, 'MOBILE')).token;
});
afterAll(() => {
  if (before === undefined) delete process.env.MAP_TILES_FILE;
  else process.env.MAP_TILES_FILE = before;
});

/** A link with a tampered signature (always a different first character). */
const forge = (url: string) =>
  url.replace(/sig=(.)/, (_m, c: string) => `sig=${c === 'A' ? 'B' : 'A'}`);

async function get(handler: H, url: string, headers: Record<string, string> = {}) {
  return handler(new Request(new URL(url, 'http://localhost'), { headers }), undefined as never);
}

describe('Places map (D99)', () => {
  it('the app asks for a signed map link (signed-in people only)', async () => {
    expect((await call(configGET as H, 'GET')).status).toBe(401);
    const r = await call(configGET as H, 'GET', { token });
    expect(r.body).toMatchObject({ available: true });
    expect(r.body.pageUrl).toMatch(/^\/api\/v1\/map\/page\?exp=\d+&sig=/);
  });

  it('the page needs a valid link, carries a strict policy and a signed tiles link', async () => {
    const { pageUrl } = (await call(configGET as H, 'GET', { token })).body;
    expect((await get(pageGET as H, forge(pageUrl))).status).toBe(403);
    const res = await get(pageGET as H, pageUrl);
    expect(res.status).toBe(200);
    const csp = res.headers.get('content-security-policy')!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/script-src 'nonce-[^']+' https:\/\/unpkg\.com/);
    // Fonts and icons: the whole folder (a source without a trailing slash matches only that
    // exact address, which blocked every file on phones).
    expect(csp).toContain("connect-src 'self' https://protomaps.github.io/basemaps-assets/;");
    expect(csp).toContain('img-src data: blob: https://protomaps.github.io/basemaps-assets/;');

    const html = await res.text();
    expect(html).toContain('maplibre-gl@5.24.0');
    expect(html).toMatch(/\/api\/v1\/map\/tiles\?exp=\d+&sig=/);
  });

  it('tiles: signed byte ranges only, never the whole file', async () => {
    const { pageUrl } = (await call(configGET as H, 'GET', { token })).body;
    const html = await (await get(pageGET as H, pageUrl)).text();
    const tiles = /\/api\/v1\/map\/tiles\?exp=\d+&sig=[A-Za-z0-9_-]+/.exec(html)![0];
    expect((await get(tilesGET as H, forge(tiles), { range: 'bytes=0-9' })).status).toBe(403);
    expect((await get(tilesGET as H, tiles)).status).toBe(400);
    const part = await get(tilesGET as H, tiles, { range: 'bytes=10-19' });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 10-19/1000');
    expect(Buffer.from(await part.arrayBuffer()).equals(BYTES.subarray(10, 20))).toBe(true);
    expect((await get(tilesGET as H, tiles, { range: 'bytes=5000-5010' })).status).toBe(416);
  });

  // D113: the map is kept on the phone for a week.
  it('tiles: the same link all week, cached 7 days, and a new link when the map file changes', async () => {
    const mon = new Date('2026-10-19T09:00:00Z');
    const fri = new Date('2026-10-21T23:00:00Z'); // same week bucket (weeks start on Thursdays UTC)
    expect(signedMapUrl('tiles', mon, 'v1')).toBe(signedMapUrl('tiles', fri, 'v1'));
    expect(signedMapUrl('tiles', mon, 'v1')).not.toBe(signedMapUrl('tiles', mon, 'v2'));
    const { pageUrl } = (await call(configGET as H, 'GET', { token })).body;
    const html = await (await get(pageGET as H, pageUrl)).text();
    const tiles = /\/api\/v1\/map\/tiles\?exp=\d+&sig=[A-Za-z0-9_-]+&v=[0-9a-f-]+/.exec(html)![0];
    const part = await get(tilesGET as H, tiles, { range: 'bytes=0-9' });
    expect(part.headers.get('cache-control')).toBe('private, max-age=604800, immutable');
  });

  // D113: markers drawn with the app's icon font.
  it('the icon font is served and every category icon has the app font’s character', async () => {
    const res = await get(fontGET as H, '/api/v1/map/font');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('font/ttf');
    expect(res.headers.get('cache-control')).toContain('max-age=604800');
    const glyphMap =
      '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json';
    const glyphs = ((await import(glyphMap)) as { default: Record<string, number> }).default;
    for (const icon of Object.values(CATEGORY_ICONS)) expect(ICON_GLYPHS[icon]).toBe(glyphs[icon]);
    const { pageUrl } = (await call(configGET as H, 'GET', { token })).body;
    const page = await get(pageGET as H, pageUrl);
    expect(page.headers.get('content-security-policy')).toContain("font-src 'self'");
  });

  it('says so when the map file isn’t there', async () => {
    const was = process.env.MAP_TILES_FILE;
    process.env.MAP_TILES_FILE = path.join(tmpdir(), 'missing-jax-map.pmtiles');
    expect((await call(configGET as H, 'GET', { token })).body).toEqual({ available: false });
    process.env.MAP_TILES_FILE = was;
  });
});
