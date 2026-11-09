import { beforeEach, describe, expect, it } from 'vitest';
import { POST as decisionPOST } from '@/app/api/v1/admin/place-requests/[id]/route';
import { GET as ownerInfoGET } from '@/app/api/v1/places/[id]/owner-info/route';
import { listPlaceRequests } from '@/server/admin/place-requests';
import { createSession } from '@/server/auth/sessions';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { ensureTiers } from '@/server/plan-tiers';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D185 / D224 (B6.4, B6.5): owners verify and add their place on the business website; an
// admin decides in the portal. Personal app accounts never come into it.

const CAFE = { latitude: 30.315, longitude: -81.686 };
const NEW_SPOT = { latitude: 30.3322, longitude: -81.6557 }; // downtown, inside Duval
let admin: Record<string, string>;
let cafe: string;
let owner: { id: string };

const decide = (id: string, body: object, headers = admin) =>
  call(decisionPOST as H, 'POST', { headers, params: { id }, body });
const request = (
  data: Partial<Parameters<typeof db.businessVerificationRequest.create>[0]['data']>,
) =>
  db.businessVerificationRequest.create({
    data: { accountId: owner.id, placeName: 'Bold Bean', contactName: 'Ann', ...data } as never,
  });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
  await ensureTiers(db);
  await importOsmPlaces(db, [
    {
      type: 'node',
      id: 1,
      lat: CAFE.latitude,
      lon: CAFE.longitude,
      tags: { amenity: 'cafe', name: 'Bold Bean' },
    },
  ]);
  cafe = (await db.businessPlace.findFirstOrThrow()).id;
  owner = await db.businessAccount.create({
    data: { email: 'owner@boldbean.com', passwordHash: 'x' },
  });
  admin = await adminHeaders((await createTestUser('mod_pr', { role: 'ADMIN' })).id);
}, 60_000);

describe('verify me / add my business (D224)', () => {
  it('approving a place on the map gives Owner access, the free month and a notice', async () => {
    const r = await request({ placeId: cafe });
    expect((await listPlaceRequests('PENDING')).rows.map((x) => x.kind)).toEqual(['verify']);
    expect((await decide(r.id, { decision: 'approve' })).status).toBe(200);
    expect(
      await db.businessPlaceAccess.findFirstOrThrow({ where: { accountId: owner.id } }),
    ).toMatchObject({ placeId: cafe, role: 'OWNER', verifiedBy: 'ADMIN' });
    expect(await db.subscription.findFirstOrThrow()).toMatchObject({
      accountId: owner.id,
      source: 'FREE_TIER',
      freeTierPlaceId: cafe,
    });
    expect(await db.businessNotice.findFirstOrThrow()).toMatchObject({ kind: 'PLACE_ADDED' });
    expect((await db.businessVerificationRequest.findFirstOrThrow()).status).toBe('APPROVED');
  });

  it('a new business goes on the map at the confirmed pin', async () => {
    const r = await request({
      placeName: 'Riverside Tacos',
      placeAddress: '1 W Bay St, Jacksonville, FL',
      category: 'restaurant',
      ...NEW_SPOT,
    });
    const res = await decide(r.id, { decision: 'approve' });
    expect(res.status).toBe(200);
    const place = await db.businessPlace.findUniqueOrThrow({ where: { id: res.body.placeId } });
    expect(place).toMatchObject({ name: 'Riverside Tacos', status: 'ACTIVE' });
    expect(place.latitude).toBeCloseTo(NEW_SPOT.latitude, 3);
    expect(await db.businessPlaceAccess.count({ where: { placeId: place.id } })).toBe(1);
  });

  it('shows nearby places, and can approve onto one of them instead', async () => {
    const r = await request({
      placeName: 'Bold Bean Coffee',
      placeAddress: '1 Main St',
      category: 'cafe',
      latitude: CAFE.latitude + 0.0002,
      longitude: CAFE.longitude,
    });
    const [row] = (await listPlaceRequests('PENDING')).rows;
    expect(row!.nearby.map((p) => p.id)).toEqual([cafe]);
    expect((await decide(r.id, { decision: 'approve', usePlaceId: cafe })).status).toBe(200);
    expect(await db.businessPlace.count()).toBe(1); // no second place
  });

  // 🔒 Never takes a place from its owner, never gives one to a staff login or outside Duval.
  it('refuses a place that has an owner, a staff login, and a pin outside Duval', async () => {
    const other = await db.businessAccount.create({
      data: { email: 'o@x.test', passwordHash: 'x' },
    });
    await db.businessPlaceAccess.create({
      data: { accountId: other.id, placeId: cafe, role: 'OWNER' },
    });
    const taken = await request({ placeId: cafe });
    expect((await decide(taken.id, { decision: 'approve' })).body.error.code).toBe(
      'PLACE_HAS_OWNER',
    );

    const staff = await db.businessAccount.create({
      data: { username: 'sam.x', passwordHash: 'x', createdById: other.id },
    });
    const byStaff = await db.businessVerificationRequest.create({
      data: { accountId: staff.id, placeName: 'X', contactName: 'Sam' },
    });
    expect((await decide(byStaff.id, { decision: 'approve' })).body.error.code).toBe(
      'NOT_OWNER_ACCOUNT',
    );

    const far = await request({
      placeName: 'Far Away',
      placeAddress: 'Orlando',
      category: 'cafe',
      latitude: 28.54,
      longitude: -81.38,
    });
    expect((await decide(far.id, { decision: 'approve' })).body.error.code).toBe(
      'OUTSIDE_SERVICE_AREA',
    );
  });

  it('turning one down needs a reason, which the business reads', async () => {
    const r = await request({ placeId: cafe });
    expect((await decide(r.id, { decision: 'reject' })).status).toBe(400);
    expect(
      (await decide(r.id, { decision: 'reject', note: 'We couldn’t reach the number on file' }))
        .status,
    ).toBe(200);
    expect(await db.businessNotice.findFirstOrThrow()).toMatchObject({
      kind: 'FROM_JAXSIDE',
      body: 'We couldn’t reach the number on file',
    });
  });

  // 🔒 Admins only.
  it('refuses anyone but an admin', async () => {
    const r = await request({ placeId: cafe });
    const u = await createTestUser('not_admin_pr');
    const token = (await createSession(u.id, 'MOBILE')).token;
    const res = await call(decisionPOST as H, 'POST', {
      token,
      params: { id: r.id },
      body: { decision: 'approve' },
    });
    expect([401, 403]).toContain(res.status);
    expect(await db.businessPlaceAccess.count()).toBe(0);
  });
});

describe('Add it from Google (D225)', () => {
  const fromGoogle = () =>
    request({
      placeName: 'Riverside Tacos',
      placeAddress: '1 W Bay St, Jacksonville, FL',
      category: 'restaurant',
      ...NEW_SPOT,
      googleLocation: 'locations/123',
    });

  it('shows as Google confirmed; approving records the owner as verified by Google', async () => {
    const r = await fromGoogle();
    expect((await listPlaceRequests('PENDING')).rows[0]).toMatchObject({ googleConfirmed: true });
    expect((await decide(r.id, { decision: 'approve' })).status).toBe(200);
    expect(
      await db.businessPlaceAccess.findFirstOrThrow({ where: { accountId: owner.id } }),
    ).toMatchObject({ verifiedBy: 'GOOGLE', googleLocation: 'locations/123' });
  });

  // 🔒 One Google listing, one owner; one open request per listing.
  it('refuses a listing another business already runs, and a second open request for it', async () => {
    const other = await db.businessAccount.create({
      data: { email: 'b@x.test', passwordHash: 'x' },
    });
    await db.businessPlaceAccess.create({
      data: { accountId: other.id, placeId: cafe, role: 'OWNER', googleLocation: 'locations/123' },
    });
    const r = await fromGoogle();
    expect((await listPlaceRequests('PENDING')).rows[0]?.googleTakenBy).toMatchObject({ id: cafe });
    expect((await decide(r.id, { decision: 'approve' })).body.error.code).toBe('GOOGLE_TAKEN');
    await expect(fromGoogle()).rejects.toThrow();
  });
});

describe('the app’s "I own this place" screen (B6.5)', () => {
  // 🔒 It says whether the place has a verified owner, never who.
  it('says whether there is an owner and where the website is, nothing about who', async () => {
    const u = await createTestUser('reader_pr');
    const token = (await createSession(u.id, 'MOBILE')).token;
    const info = () => call(ownerInfoGET as H, 'GET', { token, id: cafe });
    expect((await info()).body).toEqual({
      placeName: 'Bold Bean',
      hasVerifiedOwner: false,
      signupUrl: null,
    });
    await db.businessPlaceAccess.create({
      data: { accountId: owner.id, placeId: cafe, role: 'OWNER' },
    });
    const after = await info();
    expect(after.body.hasVerifiedOwner).toBe(true);
    expect(JSON.stringify(after.body)).not.toContain('owner@boldbean.com');
  });
});
