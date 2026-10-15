import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import {
  buildOverpassQuery,
  categorize,
  importOsmPlaces,
  normalizeName,
  OSM_ATTRIBUTION,
  type OsmElement,
} from '@/server/directory/osm';
import { importServiceArea, readBoundaryFile } from '@/server/location/service-area';
import { resetDb } from './db-helpers';

const FIXTURE: OsmElement[] = [
  {
    type: 'node',
    id: 1,
    lat: 30.315,
    lon: -81.686,
    tags: { amenity: 'cafe', name: 'Bold Bean Coffee' },
  },
  // Same café mapped as a building ~20 m away: duplicate, the node wins.
  {
    type: 'way',
    id: 2,
    center: { lat: 30.31515, lon: -81.6861 },
    tags: { amenity: 'cafe', name: 'Bold Bean Coffee' },
  },
  { type: 'node', id: 3, lat: 30.33, lon: -81.66, tags: { office: 'company', name: 'Acme Corp' } },
  { type: 'node', id: 4, lat: 30.33, lon: -81.66, tags: { amenity: 'restaurant' } }, // no name
  {
    type: 'node',
    id: 5,
    lat: 30.2397,
    lon: -81.3856,
    tags: { amenity: 'restaurant', name: 'Ponte Vedra Inn' },
  }, // St Johns County
  { type: 'node', id: 6, lat: 30.25, lon: -81.6, tags: { shop: 'car', name: 'River City Motors' } },
  {
    type: 'way',
    id: 7,
    center: { lat: 30.3088, lon: -81.6823 },
    tags: { leisure: 'park', name: 'Memorial Park' },
  },
  { type: 'node', id: 8, lat: 30.32, lon: -81.65, tags: { shop: 'vacant', name: 'Old Store' } },
  {
    type: 'node',
    id: 9,
    lat: 30.2856,
    lon: -81.3884,
    tags: { natural: 'beach', name: 'Jacksonville Beach' },
  },
  {
    type: 'node',
    id: 10,
    lat: 30.33,
    lon: -81.655,
    tags: {
      amenity: 'pub',
      name: 'The Brewery & Co.',
      'addr:housenumber': '12',
      'addr:street': 'Main St',
      'addr:city': 'Jacksonville',
    },
  },
];

beforeEach(async () => {
  await resetDb();
  await importServiceArea(db, readBoundaryFile());
});

const osmCount = () => db.businessPlace.count({ where: { sourceName: 'osm', status: 'ACTIVE' } });

describe('tag allow-list (P2.10)', () => {
  it.each([
    [{ amenity: 'restaurant' }, 'restaurant'],
    [{ amenity: 'pub' }, 'bar'],
    [{ shop: 'car' }, 'car_dealer'],
    [{ shop: 'supermarket' }, 'grocery'],
    [{ shop: 'books' }, 'shop'],
    [{ leisure: 'park' }, 'park'],
    [{ tourism: 'museum' }, 'museum'],
    [{ natural: 'beach' }, 'beach'],
  ])('%j → %s', (tags, cat) => {
    expect(categorize(tags as Record<string, string>)).toBe(cat);
  });

  it.each([
    [{ office: 'company' }],
    [{ office: 'lawyer', shop: 'vacant' }],
    [{ building: 'house' }],
    [{ amenity: 'parking' }],
    [{ amenity: 'bench' }],
  ])('excludes %j', (tags) => {
    expect(categorize(tags as Record<string, string>)).toBeNull();
  });

  it('the Overpass query asks only for named, allow-listed features and never offices', () => {
    const q = buildOverpassQuery([30.1, -82.05, 30.59, -81.31]);
    expect(q).toContain('["name"]');
    expect(q).toContain('"amenity"~"^(restaurant|');
    expect(q).not.toContain('nwr["office"'); // the office tag is never requested
    expect(q).toContain('out center tags;');
  });
});

describe('normalizeName', () => {
  it.each([
    ['The Brewery & Co.', 'brewery and co'],
    ["Joe's Café", 'joes cafe'],
    ['  BOLD   Bean ', 'bold bean'],
  ])('%s → %s', (name, norm) => {
    expect(normalizeName(name)).toBe(norm);
  });
});

describe('importOsmPlaces (P2.11)', () => {
  it('keeps public-facing places inside Duval, drops outside/duplicates/offices/unnamed', async () => {
    const r = await importOsmPlaces(db, FIXTURE);
    expect(r).toMatchObject({ candidates: 7, outsideArea: 1, duplicates: 1, inserted: 5 });
    const names = (await db.businessPlace.findMany({ orderBy: { name: 'asc' } })).map((p) => [
      p.name,
      p.category,
      p.sourceId,
    ]);
    expect(names).toEqual([
      ['Bold Bean Coffee', 'cafe', 'node/1'],
      ['Jacksonville Beach', 'beach', 'node/9'],
      ['Memorial Park', 'park', 'way/7'],
      ['River City Motors', 'car_dealer', 'node/6'],
      ['The Brewery & Co.', 'bar', 'node/10'],
    ]);
    const pub = await db.businessPlace.findFirstOrThrow({ where: { sourceId: 'node/10' } });
    expect(pub.address).toBe('12 Main St, Jacksonville');
    expect(pub.attribution).toBe(OSM_ATTRIBUTION);
  });

  // ✅ D1: running the import twice gives the same records.
  it('is idempotent: a second run inserts and changes nothing', async () => {
    await importOsmPlaces(db, FIXTURE);
    const before = await db.businessPlace.findMany({ orderBy: { sourceId: 'asc' } });
    const r = await importOsmPlaces(db, FIXTURE);
    expect(r).toMatchObject({ inserted: 0, updated: 0, unchanged: 5, deactivated: 0 });
    const after = await db.businessPlace.findMany({ orderBy: { sourceId: 'asc' } });
    expect(after.map((p) => [p.id, p.updatedAt.getTime()])).toEqual(
      before.map((p) => [p.id, p.updatedAt.getTime()]),
    );
  });

  it('updates a renamed place in place (same ID)', async () => {
    await importOsmPlaces(db, FIXTURE);
    const id = (await db.businessPlace.findFirstOrThrow({ where: { sourceId: 'node/6' } })).id;
    const renamed = FIXTURE.map((e) =>
      e.id === 6 ? { ...e, tags: { ...e.tags, name: 'River City Toyota' } } : e,
    );
    expect((await importOsmPlaces(db, renamed)).updated).toBe(1);
    const p = await db.businessPlace.findUniqueOrThrow({ where: { id } });
    expect([p.name, p.nameNormalized]).toEqual(['River City Toyota', 'river city toyota']);
  });

  it('marks places removed from OSM inactive, and reactivates them if they return', async () => {
    await importOsmPlaces(db, FIXTURE);
    const withoutPark = FIXTURE.filter((e) => e.id !== 7);
    expect((await importOsmPlaces(db, withoutPark)).deactivated).toBe(1);
    expect(await osmCount()).toBe(4);
    expect((await importOsmPlaces(db, FIXTURE)).updated).toBe(1);
    expect(await osmCount()).toBe(5);
  });

  it('does not deactivate anything when a download looks truncated', async () => {
    await importOsmPlaces(db, FIXTURE);
    const r = await importOsmPlaces(db, FIXTURE.slice(0, 1));
    expect(r.deactivationSkipped).toBe(true);
    expect(await osmCount()).toBe(5);
  });

  it('skips a place already in the directory from another source (same name within 50 m)', async () => {
    await db.$executeRaw`
      INSERT INTO "BusinessPlace" (id, name, "nameNormalized", category, latitude, longitude, location,
                                   "sourceName", "sourceId", "updatedAt")
      VALUES (gen_random_uuid(), 'Bold Bean Coffee', 'bold bean coffee', 'cafe', 30.31502, -81.68601,
              ST_SetSRID(ST_MakePoint(-81.68601, 30.31502), 4326)::geography, 'submission', 's1', now())`;
    const r = await importOsmPlaces(db, FIXTURE);
    expect(r.inserted).toBe(4);
    expect(await db.businessPlace.count({ where: { nameNormalized: 'bold bean coffee' } })).toBe(1);
  });
});
