import { beforeEach, describe, expect, it } from 'vitest';
import { POST as adminRatingsPOST } from '@/app/api/v1/admin/places/[id]/ratings/route';
import { PUT as ratePUT } from '@/app/api/v1/places/[id]/rating/route';
import { POST as placePOST } from '@/app/api/v1/places/[id]/route';
import { POST as searchPOST } from '@/app/api/v1/places/search/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D144: like / dislike a place, only while there; one vote per account; % after 10 votes.

const DAY = 86_400_000;
const HERE = { latitude: 30.3151, longitude: -81.686 }; // at the cafe
const FAR = { latitude: 30.33, longitude: -81.686 }; // ~1.7 km away
const reading = (p = HERE) => ({ ...p, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

type P = { id: string; token: string };
let n = 0;
async function person(ageDays = 10): Promise<P> {
  const u = await createTestUser(`rater${n++}_r`, {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - ageDays * DAY),
  });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}
const rate = (p: P, value: 1 | -1 | 0, at = HERE) =>
  call(ratePUT as H, 'PUT', { token: p.token, id: cafe, body: { reading: reading(at), value } });
const counts = () =>
  db.businessPlace.findUniqueOrThrow({
    where: { id: cafe },
    select: { likeCount: true, dislikeCount: true },
  });
const view = async (p: P) =>
  (await call(placePOST as H, 'POST', { token: p.token, id: cafe, body: { reading: reading() } }))
    .body.place;

let cafe: string;
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
    {
      type: 'node',
      id: 2,
      lat: 30.3152,
      lon: -81.6862,
      tags: { amenity: 'cafe', name: 'Second Cup' },
    },
  ]);
  cafe = (await db.businessPlace.findFirstOrThrow({ where: { name: 'Bold Bean' } })).id;
}, 60_000);

describe('rating a place (D144)', () => {
  // 🔒 One vote per account: voting again only changes it.
  it('counts one vote per person, which can be changed or taken back', async () => {
    const me = await person();
    expect((await rate(me, 1)).status).toBe(200);
    expect((await rate(me, 1)).status).toBe(200); // again: still one like
    expect(await counts()).toEqual({ likeCount: 1, dislikeCount: 0 });
    expect((await rate(me, -1)).body.myRating).toBe(-1); // changed
    expect(await counts()).toEqual({ likeCount: 0, dislikeCount: 1 });
    await rate(me, 0); // taken back
    expect(await counts()).toEqual({ likeCount: 0, dislikeCount: 0 });
    expect(await db.placeRating.count()).toBe(0);
  });

  it('keeps exact counts when many people vote at the same moment', async () => {
    const people = await Promise.all(Array.from({ length: 12 }, () => person()));
    await Promise.all(people.map((p, i) => rate(p, i < 9 ? 1 : -1)));
    // and the same people voting again all at once changes nothing
    await Promise.all(people.map((p, i) => rate(p, i < 9 ? 1 : -1)));
    expect(await counts()).toEqual({ likeCount: 9, dislikeCount: 3 });
    expect(await db.placeRating.count()).toBe(12);
  });

  it('shows % liked only once 10 people voted, in the list and on the place', async () => {
    const people = await Promise.all(Array.from({ length: 10 }, () => person()));
    for (const p of people.slice(0, 9)) await rate(p, p === people[0] ? -1 : 1);
    const viewer = await person();
    expect((await view(viewer)).rating).toBeNull(); // 9 votes: not shown yet
    await rate(people[9]!, 1);
    expect((await view(viewer)).rating).toEqual({ likedPercent: 90, votes: 10 });
    expect((await view(people[0]!)).myRating).toBe(-1);

    const list = await call(searchPOST as H, 'POST', {
      token: viewer.token,
      body: { reading: reading(), sort: 'liked' },
    });
    expect(list.body.places[0]).toMatchObject({
      name: 'Bold Bean',
      rating: { likedPercent: 90, votes: 10 },
    });
    expect(list.body.places[1]).toMatchObject({ name: 'Second Cup', rating: null });
  });

  // 🔒 Only while there, not your own place, not brand-new accounts, not while locked.
  it('refuses votes from away, from the owner, from new accounts and while locked', async () => {
    const away = await person();
    expect((await rate(away, 1, FAR)).status).toBe(403);

    const owner = await person();
    await db.ownerClaim.create({
      data: { placeId: cafe, userId: owner.id, method: 'EMAIL', status: 'VERIFIED' },
    });
    expect((await rate(owner, 1)).body.error.code).toBe('OWNER');

    const fresh = await person(1);
    expect((await rate(fresh, 1)).body.error.code).toBe('ACCOUNT_TOO_NEW');

    await db.businessPlace.update({ where: { id: cafe }, data: { ratingsLockedAt: new Date() } });
    const r = await rate(await person(), 1);
    expect(r.status).toBe(423);
    expect(await counts()).toEqual({ likeCount: 0, dislikeCount: 0 });
  });
});

describe('admin tools (D144)', () => {
  it('locks, unlocks and clears a place’s votes, each audited', async () => {
    const admin = await adminHeaders((await createTestUser('rate_admin', { role: 'ADMIN' })).id);
    const act = (action: string) =>
      call(adminRatingsPOST as H, 'POST', {
        headers: admin,
        id: cafe,
        body: { action, reason: 'Pile-on after a viral post' },
      });
    const fan = await person();
    await rate(fan, 1);

    expect((await act('lock')).status).toBe(200);
    expect((await view(fan)).ratingsLocked).toBe(true);
    expect((await rate(fan, -1)).status).toBe(423);
    await act('unlock');
    expect((await rate(fan, -1)).status).toBe(200);

    await act('clear');
    expect(await counts()).toEqual({ likeCount: 0, dislikeCount: 0 });
    expect(await db.placeRating.count()).toBe(0);
    const logs = await db.adminAuditLog.findMany({
      where: { action: { startsWith: 'PLACE_RATINGS_' } },
    });
    expect(logs.map((l) => l.action).sort()).toEqual([
      'PLACE_RATINGS_CLEAR',
      'PLACE_RATINGS_LOCK',
      'PLACE_RATINGS_UNLOCK',
    ]);
  });

  // 🔒 App users can't use them.
  it('refuses app users', async () => {
    const u = await person();
    const r = await call(adminRatingsPOST as H, 'POST', {
      token: u.token,
      id: cafe,
      body: { action: 'clear', reason: 'nope nope' },
    });
    expect(r.status).toBe(401);
  });
});
