import { beforeEach, describe, expect, it } from 'vitest';
import { POST as searchPOST } from '@/app/api/v1/places/search/route';
import { POST as placePOST } from '@/app/api/v1/places/[id]/route';
import { PUT as favPUT, DELETE as favDELETE } from '@/app/api/v1/places/[id]/favorite/route';
import { GET as favoritesGET } from '@/app/api/v1/me/favorites/route';
import { PATCH as prefsPATCH } from '@/app/api/v1/me/preferences/route';
import { GET as meGET } from '@/app/api/v1/me/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { CATEGORY_GROUPS } from '@jax/shared';
import { allCategories, importOsmPlaces, type OsmElement } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { resetDb } from './db-helpers';
import { createTestUser } from './user-factory';

// The user stands at Five Points.
const ME = { latitude: 30.3149, longitude: -81.6853 };
const reading = (p = ME) => ({ ...p, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

const PLACES: OsmElement[] = [
  {
    type: 'node',
    id: 1,
    lat: 30.315,
    lon: -81.686,
    tags: { amenity: 'cafe', name: 'Bold Bean Coffee' },
  }, // ~70 m
  {
    type: 'node',
    id: 2,
    lat: 30.3176,
    lon: -81.6853,
    tags: { shop: 'convenience', name: 'Corner Store' },
  }, // ~300 m
  {
    type: 'node',
    id: 3,
    lat: 30.3088,
    lon: -81.6823,
    tags: { leisure: 'park', name: 'Memorial Park' },
  }, // ~740 m
  {
    type: 'node',
    id: 4,
    lat: 30.33,
    lon: -81.655,
    tags: { amenity: 'pub', name: 'The Brewery & Co.' },
  }, // ~3.4 km
  {
    type: 'node',
    id: 5,
    lat: 30.2856,
    lon: -81.3884,
    tags: { natural: 'beach', name: 'Jacksonville Beach' },
  }, // ~29 km
];

let tokenA: string;
let tokenB: string;
const idOf = async (name: string) =>
  (await db.businessPlace.findFirstOrThrow({ where: { name } })).id;

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  await importServiceArea(db, readBoundaryFile());
  await importOsmPlaces(db, PLACES);
  // These fixtures span a few miles to test sorting; the 1-mile list cap (D69) has its own test.
  await db.appConfiguration.create({ data: { key: 'directory.maxListMiles', value: 50 } });
  tokenA = (await createSession((await createTestUser('alice_d')).id, 'MOBILE')).token;
  tokenB = (await createSession((await createTestUser('bob_d')).id, 'MOBILE')).token;
});

type Handler = (req: Request, ctx: never) => Promise<Response>;
async function call(
  handler: Handler,
  method: string,
  opts: { token?: string; body?: unknown; id?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const req = new Request('http://localhost/x', {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const res = await handler(req, { params: Promise.resolve({ id: opts.id ?? '' }) } as never);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined, raw: text };
}
const search = (body: object, token = tokenA) =>
  call(searchPOST as Handler, 'POST', { token, body: { reading: reading(), ...body } });
const names = (r: { body: { places: { name: string }[] } }) => r.body.places.map((p) => p.name);

describe('place search (P2.13)', () => {
  it('lists nearby places nearest first, with rounded distance and room eligibility', async () => {
    const r = await search({});
    expect(r.status).toBe(200);
    expect(names(r)).toEqual([
      'Bold Bean Coffee',
      'Corner Store',
      'Memorial Park',
      'The Brewery & Co.',
      'Jacksonville Beach',
    ]);
    const [bean, , park] = r.body.places;
    expect(bean.withinRoomRadius).toBe(true); // within 0.3 mi
    expect(park.withinRoomRadius).toBe(false);
    expect(bean.distanceMeters % 10).toBe(0);
    expect(r.body.attribution).toBe('© OpenStreetMap contributors'); // P2.12
  });

  it('finds places by name, tolerating typos and "&"/"the"', async () => {
    expect(names(await search({ q: 'bold bean cofee' }))[0]).toBe('Bold Bean Coffee');
    expect(names(await search({ q: 'brewery and co' }))).toEqual(['The Brewery & Co.']);
    expect(names(await search({ q: 'mem' }))).toEqual(['Memorial Park']);
  });

  it('filters by category', async () => {
    expect(names(await search({ categories: ['park'] }))).toEqual(['Memorial Park']);
    expect(names(await search({ categories: ['cafe', 'bar'] }))).toEqual([
      'Bold Bean Coffee',
      'The Brewery & Co.',
    ]);
  });

  it('every category in the app filter groups is one the importer can assign (D40)', () => {
    const known = allCategories();
    for (const g of CATEGORY_GROUPS) for (const c of g.categories) expect(known).toContain(c);
  });

  it('sorts A–Z, favorites first, or nearest', async () => {
    expect(names(await search({ sort: 'name' }))).toEqual([
      'Bold Bean Coffee',
      'The Brewery & Co.', // "brewery and co" (a leading "The" is ignored)
      'Corner Store',
      'Jacksonville Beach',
      'Memorial Park',
    ]);
    await call(favPUT as Handler, 'PUT', { token: tokenA, id: await idOf('Jacksonville Beach') });
    expect(names(await search({ sort: 'favorites' }))[0]).toBe('Jacksonville Beach');
    expect(names(await search({ sort: 'distance' }))[0]).toBe('Bold Bean Coffee');
  });

  it('honors a larger page for the map view, capped at 50', async () => {
    const r = await search({ limit: 3 });
    expect(r.body.places).toHaveLength(3);
    expect((await search({ limit: 51 })).status).toBe(400);
  });

  it.each([
    [{ sort: 'random' }],
    [{ categories: ['DROP TABLE'] }],
    [{ categories: Array(13).fill('cafe') }],
  ])('rejects %j', async (body) => {
    expect((await search(body)).status).toBe(400);
  });

  // D39: favorites rank as if 4x closer, without overriding distance entirely.
  it('favorites rise in the list but far-away favorites stay below nearby places', async () => {
    await call(favPUT as Handler, 'PUT', { token: tokenA, id: await idOf('Memorial Park') });
    await call(favPUT as Handler, 'PUT', { token: tokenA, id: await idOf('Jacksonville Beach') });
    const r = await search({});
    // Memorial Park (~740 m, counts as ~185 m) moves ahead of Corner Store (~300 m)...
    expect(names(r).slice(0, 3)).toEqual(['Bold Bean Coffee', 'Memorial Park', 'Corner Store']);
    // ...but the beach (29 km, counts as ~7 km) stays after the 3.4 km pub.
    expect(names(r).at(-1)).toBe('Jacksonville Beach');
    expect(r.body.places.find((p: { name: string }) => p.name === 'Memorial Park').isFavorite).toBe(
      true,
    );
    // Another user's favorites don't affect my order.
    expect(names(await search({}, tokenB))[1]).toBe('Corner Store');
  });

  it('pages without duplicates or gaps', async () => {
    await db.appConfiguration.create({ data: { key: 'directory.pageSize', value: 2 } });
    invalidateConfigCache();
    const p1 = await search({});
    const p2 = await search({ offset: p1.body.nextOffset });
    const p3 = await search({ offset: p2.body.nextOffset });
    expect([...names(p1), ...names(p2), ...names(p3)]).toHaveLength(5);
    expect(new Set([...names(p1), ...names(p2), ...names(p3)]).size).toBe(5);
    expect(p3.body.nextOffset).toBeNull();
  });

  it('hides inactive places', async () => {
    await db.businessPlace.updateMany({
      where: { name: 'Corner Store' },
      data: { status: 'INACTIVE' },
    });
    expect(names(await search({}))).not.toContain('Corner Store');
  });

  // 🔒 D16: no directory from outside Duval.
  it('requires a session and an in-Duval location', async () => {
    expect(
      (await call(searchPOST as Handler, 'POST', { body: { reading: reading() } })).status,
    ).toBe(401);
    const outside = await call(searchPOST as Handler, 'POST', {
      token: tokenA,
      body: { reading: reading({ latitude: 30.1661, longitude: -81.7065 }) },
    });
    expect(outside.status).toBe(403);
    expect(outside.body.error.code).toBe('LOCATION_OUTSIDE_AREA');
  });

  it('rejects unexpected fields', async () => {
    expect((await search({ userId: 'someone-else' })).status).toBe(400);
  });
});

describe('place detail', () => {
  it('returns one place with distance and room eligibility', async () => {
    const r = await call(placePOST as Handler, 'POST', {
      token: tokenA,
      id: await idOf('Bold Bean Coffee'),
      body: { reading: reading() },
    });
    expect(r.status).toBe(200);
    expect(r.body.place).toMatchObject({ name: 'Bold Bean Coffee', withinRoomRadius: true });
  });

  it.each(['not-a-uuid', '00000000-0000-7000-8000-000000000000'])('404 for %s', async (id) => {
    const r = await call(placePOST as Handler, 'POST', {
      token: tokenA,
      id,
      body: { reading: reading() },
    });
    expect(r.status).toBe(404);
  });
});

describe('favorites (P2.14)', () => {
  it('add is idempotent; remove works; list shows only my favorites', async () => {
    const id = await idOf('Memorial Park');
    expect((await call(favPUT as Handler, 'PUT', { token: tokenA, id })).body).toEqual({
      favorite: true,
    });
    await call(favPUT as Handler, 'PUT', { token: tokenA, id });
    expect(await db.favoritePlace.count()).toBe(1);
    const mine = await call(favoritesGET as Handler, 'GET', { token: tokenA });
    expect(mine.body.favorites.map((f: { name: string }) => f.name)).toEqual(['Memorial Park']);
    expect((await call(favoritesGET as Handler, 'GET', { token: tokenB })).body.favorites).toEqual(
      [],
    );

    expect((await call(favDELETE as Handler, 'DELETE', { token: tokenA, id })).body).toEqual({
      favorite: false,
    });
    expect(await db.favoritePlace.count()).toBe(0);
  });

  // 🔒 IDOR: removing "a favorite" only ever touches the caller's own list.
  it("another user can't remove my favorite", async () => {
    const id = await idOf('Memorial Park');
    await call(favPUT as Handler, 'PUT', { token: tokenA, id });
    await call(favDELETE as Handler, 'DELETE', { token: tokenB, id });
    expect(await db.favoritePlace.count()).toBe(1);
  });

  it('404 for unknown or inactive places; 409 past the cap', async () => {
    expect((await call(favPUT as Handler, 'PUT', { token: tokenA, id: 'nope' })).status).toBe(404);
    await db.businessPlace.updateMany({
      where: { name: 'Corner Store' },
      data: { status: 'INACTIVE' },
    });
    expect(
      (await call(favPUT as Handler, 'PUT', { token: tokenA, id: await idOf('Corner Store') }))
        .status,
    ).toBe(404);

    await db.appConfiguration.create({ data: { key: 'favorites.maxPerUser', value: 1 } });
    invalidateConfigCache();
    await call(favPUT as Handler, 'PUT', { token: tokenA, id: await idOf('Memorial Park') });
    const r = await call(favPUT as Handler, 'PUT', {
      token: tokenA,
      id: await idOf('Bold Bean Coffee'),
    });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('FAVORITES_FULL');
  });

  it('requires a session', async () => {
    expect((await call(favPUT as Handler, 'PUT', { id: await idOf('Memorial Park') })).status).toBe(
      401,
    );
  });
});

describe('radius preference (P2.15, D71)', () => {
  it.each([0.1, 0.2, 0.3] as const)(
    '%s mi is stored and shown as the one radius',
    async (miles) => {
      const r = await call(prefsPATCH as Handler, 'PATCH', {
        token: tokenA,
        body: { radiusMiles: miles },
      });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ radiusMiles: miles });
      const me = await call(meGET as Handler, 'GET', { token: tokenA });
      expect(me.body.user.radiusMiles).toBe(miles);
    },
  );

  // 🔒 §7 / D71: never more than 0.3 mi, and only the three choices.
  it.each([
    [{}],
    [{ radiusMiles: 0.5 }],
    [{ radiusMiles: 1 }],
    [{ radiusMiles: 0.25 }],
    [{ generalRadiusMiles: 0.2 }],
    [{ radiusMiles: 0.2, role: 'ADMIN' }],
  ])('rejects %j', async (body) => {
    expect((await call(prefsPATCH as Handler, 'PATCH', { token: tokenA, body })).status).toBe(400);
  });

  it('the Places list follows the radius', async () => {
    await db.appConfiguration.update({
      where: { key: 'directory.maxListMiles' },
      data: { value: 0.3 },
    });
    invalidateConfigCache();
    await call(prefsPATCH as Handler, 'PATCH', { token: tokenA, body: { radiusMiles: 0.1 } });
    const r = await search({ limit: 50 });
    expect(r.body.places.every((p: { distanceMeters: number }) => p.distanceMeters <= 170)).toBe(
      true,
    );
  });
});

describe('Places list limits (D69)', () => {
  it('only shows places within a mile, and only names of 30 characters or less', async () => {
    await db.appConfiguration.update({
      where: { key: 'directory.maxListMiles' },
      data: { value: 1 },
    });
    await importOsmPlaces(db, [
      {
        type: 'node',
        id: 900,
        lat: 30.3152,
        lon: -81.6851,
        tags: { amenity: 'restaurant', name: 'The Extraordinarily Long Named Restaurant & Grill' },
      },
    ]);
    invalidateConfigCache();
    const r = await search({ limit: 50 });
    const names = r.body.places.map((p: { name: string }) => p.name);
    expect(r.body.places.every((p: { distanceMeters: number }) => p.distanceMeters <= 1609)).toBe(
      true,
    );
    expect(names).not.toContain('The Extraordinarily Long Named Restaurant & Grill');
    expect(names.every((n: string) => n.length <= 30)).toBe(true);
    const all = await db.businessPlace.count();
    expect(names.length).toBeLessThan(all);
  });
});
