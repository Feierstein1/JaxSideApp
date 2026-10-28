import { beforeEach, describe, expect, it } from 'vitest';
import { POST as removePOST } from '@/app/api/v1/admin/places/[id]/remove/route';
import { POST as createPOST } from '@/app/api/v1/admin/places/route';
import { POST as removalDecidePOST } from '@/app/api/v1/admin/removals/[id]/route';
import { POST as searchPOST } from '@/app/api/v1/places/search/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { adminSearchPlaces } from '@/server/directory/admin-places';
import { importOsmPlaces } from '@/server/directory/osm';
import { purgeRemovedPlacePosts } from '@/server/directory/place-changes';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D146: the admin adds or removes any place directly; removed places' favorites and
// ratings go with their posts after 90 days.

const DAY = 86_400_000;
const HERE = { latitude: 30.3151, longitude: -81.686 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let admin: Record<string, string>;
let adminId: string;
let user: { id: string; token: string };
let cafe: string;

const listed = async () =>
  (
    (await call(searchPOST as H, 'POST', { token: user.token, body: { reading: reading() } })).body
      .places as { name: string }[]
  ).map((p) => p.name);
const removeNow = (id: string, headers = admin) =>
  call(removePOST as H, 'POST', { headers, id, body: { reason: 'Closed for good' } });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
  invalidateConfigCache();
  await importOsmPlaces(db, [
    {
      type: 'node',
      id: 1,
      lat: 30.315,
      lon: -81.686,
      tags: { amenity: 'cafe', name: 'Bold Bean' },
    },
  ]);
  cafe = (await db.businessPlace.findFirstOrThrow()).id;
  adminId = (await createTestUser('ap_admin', { role: 'ADMIN' })).id;
  admin = await adminHeaders(adminId);
  const u = await createTestUser('ap_user', {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - 10 * DAY),
  });
  user = { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}, 60_000);

describe('adding a place (D146)', () => {
  it('goes live at once, inside Duval only, and is audited', async () => {
    const r = await call(createPOST as H, 'POST', {
      headers: admin,
      body: {
        name: 'Corner Tacos',
        category: 'restaurant',
        address: '1 Main St',
        latitude: 30.3152,
        longitude: -81.6858,
      },
    });
    expect(r.status).toBe(201);
    expect(await listed()).toContain('Corner Tacos');
    const sub = await db.businessSubmission.findFirstOrThrow({ where: { name: 'Corner Tacos' } });
    expect(sub).toMatchObject({ status: 'APPROVED', reviewerId: adminId, placeId: r.body.placeId });
    expect(await db.adminAuditLog.count({ where: { action: 'PLACE_CREATE' } })).toBe(1);

    const outside = await call(createPOST as H, 'POST', {
      headers: admin,
      body: {
        name: 'Orange Park Diner',
        category: 'restaurant',
        latitude: 30.1661,
        longitude: -81.7065,
      },
    });
    expect(outside.body.error.code).toBe('OUTSIDE_SERVICE_AREA');
  });
});

describe('removing any place (D146)', () => {
  it('takes it down without a request; Keep in Removals puts it back', async () => {
    expect(await listed()).toEqual(['Bold Bean']);
    expect((await removeNow(cafe)).status).toBe(200);
    expect(await listed()).toEqual([]);
    expect((await removeNow(cafe)).status).toBe(409); // already removed

    const removal = await db.placeRemoval.findFirstOrThrow({ where: { placeId: cafe } });
    expect(removal).toMatchObject({ status: 'REMOVED', resolvedById: adminId });
    expect((await adminSearchPlaces('bold bean'))[0]).toMatchObject({ status: 'REMOVED' });

    await call(removalDecidePOST as H, 'POST', {
      headers: admin,
      id: removal.id,
      body: { action: 'keep' },
    });
    expect(await listed()).toEqual(['Bold Bean']);
  });

  it('closes an open removal request instead of adding a second one', async () => {
    await db.placeRemoval.create({ data: { placeId: cafe, requesterId: user.id } });
    await removeNow(cafe);
    expect(await db.placeRemoval.findMany({ where: { placeId: cafe } })).toEqual([
      expect.objectContaining({ status: 'REMOVED', requesterId: user.id, resolvedById: adminId }),
    ]);
  });

  // 🔒 Admins only.
  it('refuses app users', async () => {
    expect((await removeNow(cafe, { authorization: `Bearer ${user.token}` })).status).toBe(401);
    const add = await call(createPOST as H, 'POST', {
      token: user.token,
      body: { name: 'Sneaky', category: 'cafe', latitude: 30.3152, longitude: -81.6858 },
    });
    expect(add.status).toBe(401);
    expect(await listed()).toEqual(['Bold Bean']);
  });
});

describe('a removed place after 90 days (D146)', () => {
  it('loses its favorites and ratings along with its posts; not before', async () => {
    await db.favoritePlace.create({ data: { userId: user.id, placeId: cafe } });
    await db.placeRating.create({ data: { userId: user.id, placeId: cafe, value: 1 } });
    await db.businessPlace.update({ where: { id: cafe }, data: { likeCount: 1 } });
    await removeNow(cafe);

    await purgeRemovedPlacePosts();
    expect(await db.favoritePlace.count()).toBe(1); // within 90 days: kept (a restore keeps them)
    expect(await db.placeRating.count()).toBe(1);

    await purgeRemovedPlacePosts(new Date(Date.now() + 91 * DAY));
    expect(await db.favoritePlace.count()).toBe(0);
    expect(await db.placeRating.count()).toBe(0);
    expect(await db.businessPlace.findUniqueOrThrow({ where: { id: cafe } })).toMatchObject({
      likeCount: 0,
      dislikeCount: 0,
      status: 'REMOVED',
    });
  });
});
