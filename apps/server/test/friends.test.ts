import { beforeEach, describe, expect, it } from 'vitest';
import { GET as friendsGET } from '@/app/api/v1/friends/route';
import { GET as activityGET } from '@/app/api/v1/friends/activity/route';
import { DELETE as unfriendDELETE } from '@/app/api/v1/friends/[username]/route';
import { GET as requestsGET, POST as requestPOST } from '@/app/api/v1/friends/requests/route';
import { DELETE as cancelDELETE } from '@/app/api/v1/friends/requests/[id]/route';
import { POST as acceptPOST } from '@/app/api/v1/friends/requests/[id]/accept/route';
import { POST as declinePOST } from '@/app/api/v1/friends/requests/[id]/decline/route';
import { PATCH as privacyPATCH } from '@/app/api/v1/me/friend-privacy/route';
import { GET as meGET } from '@/app/api/v1/me/route';
import { GET as notificationsGET } from '@/app/api/v1/notifications/route';
import { POST as readPOST } from '@/app/api/v1/notifications/read/route';
import { GET as unreadGET } from '@/app/api/v1/notifications/unread/route';
import { PUT as favPUT } from '@/app/api/v1/places/[id]/favorite/route';
import { GET as friendsFavGET } from '@/app/api/v1/places/[id]/friends-favorited/route';
import { POST as roomPostPOST } from '@/app/api/v1/places/[id]/posts/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { PUT as blockPUT } from '@/app/api/v1/users/[username]/block/route';
import { POST as profilePOST } from '@/app/api/v1/users/[username]/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D76: friends, the bell, the friends feed.

const HERE = { latitude: 30.3149, longitude: -81.6853 }; // Riverside, by Five Points
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

type P = { id: string; token: string; name: string };
let ann: P;
let bob: P;
let cat: P;
let placeId: string;

async function person(name: string, verified = true): Promise<P> {
  const u = await createTestUser(name, { emailVerifiedAt: verified ? new Date() : null });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token, name };
}

const request = (from: P, to: string) =>
  call(requestPOST as H, 'POST', { token: from.token, body: { username: to } });
const requests = async (p: P) =>
  (await call(requestsGET as H, 'GET', { token: p.token })).body as {
    incoming: { id: string; user: { username: string } }[];
    outgoing: { id: string; user: { username: string } }[];
  };
const accept = (p: P, id: string) =>
  call(acceptPOST as H, 'POST', { token: p.token, id, body: {} });
const decline = (p: P, id: string) =>
  call(declinePOST as H, 'POST', { token: p.token, id, body: {} });
const friends = async (p: P) =>
  (
    (await call(friendsGET as H, 'GET', { token: p.token })).body.friends as { username: string }[]
  ).map((f) => f.username);
const unread = async (p: P) =>
  (await call(unreadGET as H, 'GET', { token: p.token })).body.unread as number;
const profile = async (viewer: P, username: string) =>
  (
    await call(profilePOST as H, 'POST', {
      token: viewer.token,
      params: { username },
      body: { reading: reading() },
    })
  ).body;
const activity = async (p: P) =>
  (await call(activityGET as H, 'GET', { token: p.token })).body as {
    items: Record<string, unknown>[];
  };

async function befriend(a: P, b: P) {
  await request(a, b.name);
  await accept(b, (await requests(b)).incoming[0]!.id);
}

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await db.appConfiguration.createMany({
    data: [
      { key: 'rateLimit.post.perMinute', value: 100 },
      { key: 'rateLimit.friendRequest.perHour', value: 100 },
    ],
  });
  invalidateConfigCache();
  await importServiceArea(db, readBoundaryFile());
  await importOsmPlaces(db, [
    {
      type: 'node',
      id: 1,
      lat: 30.315,
      lon: -81.686,
      tags: { amenity: 'cafe', name: 'Bean Cafe' },
    },
  ]);
  placeId = (await db.businessPlace.findFirstOrThrow()).id;
  ann = await person('ann_f');
  bob = await person('bob_f');
  cat = await person('cat_f');
});

describe('friend requests (D76)', () => {
  it('request → bell → accept → friends both ways, with a notice back', async () => {
    expect((await request(ann, 'BOB_F')).body).toEqual({ state: 'requested' }); // any case
    expect((await profile(ann, 'bob_f')).profile.friendship).toBe('requested');
    expect((await profile(bob, 'ann_f')).profile.friendship).toBe('incoming');
    expect(await unread(bob)).toBe(1);
    const bell = (await call(notificationsGET as H, 'GET', { token: bob.token })).body
      .notifications;
    expect(bell[0]).toMatchObject({ type: 'FRIEND_REQUEST', actor: { username: 'ann_f' } });
    expect(bell[0].pendingRequestId).toBe((await requests(bob)).incoming[0]!.id);
    expect((await accept(bob, bell[0].pendingRequestId)).status).toBe(200);
    expect(await friends(ann)).toEqual(['bob_f']);
    expect(await friends(bob)).toEqual(['ann_f']);
    expect(await unread(bob)).toBe(0); // answering clears the request's notice
    expect(await unread(ann)).toBe(1); // "bob_f accepted"
    expect((await profile(ann, 'bob_f')).profile.friendship).toBe('friends');
    await call(readPOST as H, 'POST', { token: ann.token, body: {} });
    expect(await unread(ann)).toBe(0);
  });

  it('asking someone who already asked you makes you friends; asking twice is harmless', async () => {
    await request(ann, 'bob_f');
    expect((await request(ann, 'bob_f')).body).toEqual({ state: 'requested' });
    expect(await db.friendship.count()).toBe(1);
    expect((await request(bob, 'ann_f')).body).toEqual({ state: 'friends' });
    expect(await friends(ann)).toEqual(['bob_f']);
  });

  // 🔒 Only the person asked can answer; only the sender can withdraw.
  it('nobody else can accept, decline or cancel a request', async () => {
    await request(ann, 'bob_f');
    const id = (await requests(bob)).incoming[0]!.id;
    expect((await accept(ann, id)).status).toBe(404); // the sender
    expect((await accept(cat, id)).status).toBe(404); // a stranger
    expect((await decline(cat, id)).status).toBe(404);
    expect((await call(cancelDELETE as H, 'DELETE', { token: cat.token, id })).status).toBe(404);
    expect((await call(cancelDELETE as H, 'DELETE', { token: bob.token, id })).status).toBe(404);
    expect(await friends(ann)).toEqual([]);
  });

  it('declining is quiet; cancelling removes the request and its notice', async () => {
    await request(ann, 'bob_f');
    await decline(bob, (await requests(bob)).incoming[0]!.id);
    expect(await db.friendship.count()).toBe(0);
    expect(await unread(ann)).toBe(0); // the sender isn't told
    await request(cat, 'bob_f');
    const id = (await requests(cat)).outgoing[0]!.id;
    expect((await call(cancelDELETE as H, 'DELETE', { token: cat.token, id })).status).toBe(200);
    expect(await unread(bob)).toBe(0);
    expect((await requests(bob)).incoming).toEqual([]);
  });

  it('refuses yourself, unknown or banned people, and unconfirmed senders', async () => {
    expect((await request(ann, 'ann_f')).body.error.code).toBe('CANNOT_FRIEND_SELF');
    expect((await request(ann, 'nobody_here')).status).toBe(404);
    await db.user.update({ where: { id: cat.id }, data: { status: 'BANNED' } });
    expect((await request(ann, 'cat_f')).status).toBe(404);
    const dan = await person('dan_f', false);
    expect((await request(dan, 'ann_f')).status).toBe(403);
    expect((await request(ann, 'bad name!')).status).toBe(400);
  });

  // 🔒 Blocking stops requests and ends friendships.
  it('blocks: no hint when they blocked you; blocking ends a friendship', async () => {
    await call(blockPUT as H, 'PUT', { token: bob.token, params: { username: 'ann_f' }, body: {} });
    expect((await request(ann, 'bob_f')).status).toBe(404);
    expect((await request(bob, 'ann_f')).body.error.code).toBe('BLOCKED');
    await befriend(ann, cat);
    await call(blockPUT as H, 'PUT', { token: cat.token, params: { username: 'ann_f' }, body: {} });
    expect(await friends(ann)).toEqual([]);
    expect(await friends(cat)).toEqual([]);
  });

  it('unfriending works from either side; lists are private', async () => {
    await befriend(ann, bob);
    await befriend(ann, cat);
    expect((await friends(ann)).sort()).toEqual(['bob_f', 'cat_f']);
    expect(await friends(bob)).toEqual(['ann_f']); // bob can't see ann's other friends
    await call(unfriendDELETE as H, 'DELETE', { token: bob.token, params: { username: 'ann_f' } });
    expect(await friends(ann)).toEqual(['cat_f']);
  });

  it('limits requests waiting at once', async () => {
    await db.appConfiguration.create({ data: { key: 'friends.maxPendingOut', value: 1 } });
    invalidateConfigCache();
    await request(ann, 'bob_f');
    expect((await request(ann, 'cat_f')).body.error.code).toBe('TOO_MANY_PENDING');
  });
});

describe('friends feed (D76)', () => {
  const postArea = (p: P, body: string) =>
    call(postsPOST as H, 'POST', { token: p.token, body: { reading: reading(), body } });
  const postPlace = (p: P, body: string) =>
    call(roomPostPOST as H, 'POST', {
      token: p.token,
      id: placeId,
      body: { reading: reading(), body },
    });

  it('says where friends posted (neighborhood or place), never what or exactly where', async () => {
    await befriend(ann, bob);
    await postArea(bob, 'secret words in the area');
    await postPlace(bob, 'secret words at the cafe');
    await postArea(cat, 'not a friend'); // cat isn't ann's friend
    const { items } = await activity(ann);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: 'business',
      author: { username: 'bob_f' },
      place: { id: placeId, name: 'Bean Cafe' },
      area: null,
    });
    expect(items[1]).toMatchObject({ kind: 'general', area: 'Riverside', place: null });
    const raw = JSON.stringify(items);
    expect(raw).not.toMatch(/secret|latitude|longitude|30\.31|81\.68/);
  });

  it('“Hide my recent posts from friends” leaves you out; old and removed posts too', async () => {
    await befriend(ann, bob);
    await postArea(bob, 'hello there friends');
    await call(privacyPATCH as H, 'PATCH', {
      token: bob.token,
      body: { hidePostsFromFriends: true },
    });
    expect((await call(meGET as H, 'GET', { token: bob.token })).body.user).toMatchObject({
      hidePostsFromFriends: true,
    });
    expect((await activity(ann)).items).toEqual([]);
    await call(privacyPATCH as H, 'PATCH', {
      token: bob.token,
      body: { hidePostsFromFriends: false },
    });
    expect((await activity(ann)).items).toHaveLength(1);
    await db.generalPost.updateMany({ data: { status: 'REMOVED' } });
    expect((await activity(ann)).items).toEqual([]);
    await db.generalPost.updateMany({
      data: { status: 'VISIBLE', createdAt: new Date(Date.now() - 15 * 86_400_000) },
    });
    expect((await activity(ann)).items).toEqual([]); // older than 14 days
  });
});

describe('friends who favorited a place (D76)', () => {
  it('lists only your friends; the count stays public', async () => {
    await befriend(ann, bob);
    await call(favPUT as H, 'PUT', { token: bob.token, id: placeId });
    await call(favPUT as H, 'PUT', { token: cat.token, id: placeId });
    const r = await call(friendsFavGET as H, 'GET', { token: ann.token, id: placeId });
    expect(r.body.friends.map((f: { username: string }) => f.username)).toEqual(['bob_f']);
    const forCat = await call(friendsFavGET as H, 'GET', { token: cat.token, id: placeId });
    expect(forCat.body.friends).toEqual([]);
  });
});
