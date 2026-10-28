import { beforeEach, describe, expect, it } from 'vitest';
import { POST as feedPOST } from '@/app/api/v1/feed/route';
import { POST as createPostPOST } from '@/app/api/v1/posts/route';
import {
  POST as postDetailPOST,
  PATCH as postPATCH,
  DELETE as postDELETE,
} from '@/app/api/v1/posts/[id]/route';
import { POST as commentPOST } from '@/app/api/v1/posts/[id]/comments/route';
import { PUT as votePUT } from '@/app/api/v1/posts/[id]/vote/route';
import { POST as roomListPOST } from '@/app/api/v1/places/[id]/posts/list/route';
import { POST as roomPostPOST } from '@/app/api/v1/places/[id]/posts/route';
import { POST as bizDetailPOST, DELETE as bizDELETE } from '@/app/api/v1/business-posts/[id]/route';
import { POST as bizCommentPOST } from '@/app/api/v1/business-posts/[id]/comments/route';
import { PUT as bizVotePUT } from '@/app/api/v1/business-posts/[id]/vote/route';
import { PUT as commentVotePUT } from '@/app/api/v1/comments/[id]/vote/route';
import { DELETE as commentDELETE } from '@/app/api/v1/comments/[id]/route';
import { POST as searchPOST } from '@/app/api/v1/places/search/route';
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

const FIVE_POINTS = { latitude: 30.3149, longitude: -81.6853 };
const NEAR = { latitude: 30.31715, longitude: -81.6853 }; // ~250 m from Five Points
const MEMORIAL = { latitude: 30.3088, longitude: -81.6823 }; // ~740 m from Five Points
const DOWNTOWN = { latitude: 30.3322, longitude: -81.6557 }; // ~3.4 km away
const ORANGE_PARK = { latitude: 30.1661, longitude: -81.7065 }; // outside Duval
const reading = (p: { latitude: number; longitude: number }) => ({
  ...p,
  accuracyMeters: 10,
  timestamp: Date.now() - 2_000,
});

let alice: string; // verified
let bob: string; // verified
let carol: string; // email not verified
let aliceId: string;
let cafeId: string; // ~70 m from Five Points

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  invalidateConfigCache();
  await importServiceArea(db, readBoundaryFile());
  await importOsmPlaces(db, [
    {
      type: 'node',
      id: 1,
      lat: 30.315,
      lon: -81.686,
      tags: { amenity: 'cafe', name: 'Bold Bean' },
    },
  ]);
  cafeId = (await db.businessPlace.findFirstOrThrow()).id;
  const a = await createTestUser('alice_p', { emailVerifiedAt: new Date() });
  aliceId = a.id;
  alice = (await createSession(a.id, 'MOBILE')).token;
  bob = (
    await createSession(
      (await createTestUser('bob_p', { emailVerifiedAt: new Date() })).id,
      'MOBILE',
    )
  ).token;
  carol = (await createSession((await createTestUser('carol_p')).id, 'MOBILE')).token;
});

const post = (token: string, body: string, at = FIVE_POINTS) =>
  call(createPostPOST as H, 'POST', { token, body: { reading: reading(at), body } });
const feed = (token: string, at = FIVE_POINTS, extra: object = {}) =>
  call(feedPOST as H, 'POST', { token, body: { reading: reading(at), ...extra } });
const bodies = (r: { body: { posts: { body: string }[] } }) => r.body.posts.map((p) => p.body);

/** Tests that need many writes in a minute lift the rate limits (they're tested separately). */
async function liftLimits(...keys: string[]) {
  await db.appConfiguration.createMany({ data: keys.map((key) => ({ key, value: 1000 })) });
  invalidateConfigCache();
}

describe('general posts and feed (P3.1, P3.1a)', () => {
  it('creates a post at a coarsened point and returns no coordinates or private data', async () => {
    const r = await post(alice, 'Anyone know a good brunch spot?');
    expect(r.status).toBe(201);
    expect(r.body.post).toMatchObject({
      body: 'Anyone know a good brunch spot?',
      author: { username: 'alice_p' },
      score: 0,
      commentCount: 0,
      isMine: true,
      kind: 'general',
    });
    expect(r.raw).not.toMatch(/latitude|longitude|30\.31|81\.68|email/);
    // Stored point is the ~100 m grid point, never the exact reading (D7).
    const [p] = await db.$queryRaw<{ lat: number; lng: number }[]>`
      SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM "GeneralPost"`;
    expect([p!.lat, p!.lng]).toEqual([30.315, -81.685]);
  });

  // P13.2: rows inserted with raw SQL get time-ordered UUIDv7 IDs, like Prisma's (version digit 7).
  it('raw-SQL inserts use UUIDv7 IDs (post, location check, place, service area)', async () => {
    const id = (await post(alice, 'v7?')).body.post.id as string;
    const check = await db.locationCheck.findFirstOrThrow({ orderBy: { receivedAt: 'desc' } });
    const area = await db.serviceArea.findFirstOrThrow();
    for (const x of [id, check.id, cafeId, area.id]) {
      expect(x[14]).toBe('7');
      expect('89ab').toContain(x[19]!);
    }
  });

  // 🔒 Writes need a verified email (D11), a valid location, and a strict body.

  it('rejects unverified authors, outside locations and smuggled fields', async () => {
    expect((await post(carol, 'hi')).body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect((await post(alice, 'hi', ORANGE_PARK)).body.error.code).toBe('LOCATION_OUTSIDE_AREA');
    for (const extra of [{ authorId: aliceId }, { location: 'POINT(0 0)' }, { score: 99 }]) {
      const r = await call(createPostPOST as H, 'POST', {
        token: alice,
        body: { reading: reading(FIVE_POINTS), body: 'hi', ...extra },
      });
      expect(r.status).toBe(400);
    }
    expect(await db.generalPost.count()).toBe(0);
  });

  it('shows nearby posts and hides ones beyond the reader’s radius (≤ 0.3 mi, D71)', async () => {
    await post(alice, 'Five Points post');
    expect(bodies(await feed(bob, NEAR))).toEqual(['Five Points post']); // 250 m
    expect(bodies(await feed(bob, MEMORIAL))).toEqual([]); // 740 m > 0.3 mi (483 m)
    // A reader who narrowed their radius to 0.1 mi (161 m) no longer sees it from 250 m.
    const bobId = (await db.user.findFirstOrThrow({ where: { username: 'bob_p' } })).id;
    const setRadius = (generalRadiusMiles: number) =>
      db.userSettings.upsert({
        where: { userId: bobId },
        create: { userId: bobId, generalRadiusMiles },
        update: { generalRadiusMiles },
      });
    await setRadius(0.1);
    expect(bodies(await feed(bob, NEAR))).toEqual([]);
    // A stored radius larger than the maximum is still capped at 0.3 mi.
    await setRadius(5);
    expect(bodies(await feed(bob, MEMORIAL))).toEqual([]);
  });

  // D74: search by username or text, only within the reader's radius.
  it('searches the area feed by text or username, never past the radius', async () => {
    await liftLimits('rateLimit.post.perMinute', 'rateLimit.post.perDay');
    await post(alice, 'Pizza night at the park');
    await post(bob, 'Anyone lost a cat? 100% orange');
    await post(alice, 'Far away pizza', MEMORIAL); // 740 m: outside a 0.3 mi radius
    expect(bodies(await feed(bob, FIVE_POINTS, { q: 'PIZZA' }))).toEqual([
      'Pizza night at the park',
    ]);
    expect(bodies(await feed(bob, FIVE_POINTS, { q: '@ali' }))).toEqual([
      'Pizza night at the park',
    ]);
    // Plain text also matches the start of a username; "@" matches names only.
    expect(bodies(await feed(alice, FIVE_POINTS, { q: 'bob_' }))).toEqual([
      'Anyone lost a cat? 100% orange',
    ]);
    expect(bodies(await feed(alice, FIVE_POINTS, { q: '@cat' }))).toEqual([]);
    // % and _ are literal, not wildcards.
    expect(bodies(await feed(alice, FIVE_POINTS, { q: '0% o' }))).toEqual([
      'Anyone lost a cat? 100% orange',
    ]);
    expect(bodies(await feed(alice, FIVE_POINTS, { q: '%%' }))).toEqual([]);
    expect((await feed(alice, FIVE_POINTS, { q: 'a' })).status).toBe(400);
    // Deleted accounts never match by name.
    await db.user.update({ where: { id: aliceId }, data: { status: 'DELETED' } });
    expect(bodies(await feed(bob, FIVE_POINTS, { q: '@alice' }))).toEqual([]);
  });

  // 🔒 P3.1a / D16: no feed from outside Duval.
  it('refuses the feed outside Duval', async () => {
    expect((await feed(bob, ORANGE_PARK)).body.error.code).toBe('LOCATION_OUTSIDE_AREA');
  });

  it('an empty area returns an empty page', async () => {
    expect((await feed(bob)).body).toEqual({ posts: [], nextCursor: null, area: 'Riverside' });
  });

  // D72: "Near …" is about the reader's own spot; posts never carry a neighborhood.
  it('names the reader’s neighborhood, not the author’s', async () => {
    await post(alice, 'hi from Five Points');
    const r = await feed(bob, NEAR);
    expect(r.body.area).toEqual(expect.any(String));
    expect(JSON.stringify(r.body.posts)).not.toMatch(/area|neighborhood/i);
    expect((await feed(bob, MEMORIAL)).body.area).not.toBeUndefined();
  });

  // ✅ DV6: cursor paging has no duplicates or skips, even when new posts arrive mid-scroll.
  // D112: 30 per page by default ("Load more posts" in the app).
  it('the feed loads 30 posts at a time', async () => {
    await liftLimits('rateLimit.post.perMinute', 'rateLimit.post.perDay');
    for (let i = 1; i <= 31; i++) await post(alice, `post ${i}`);
    const p1 = await feed(bob);
    expect(bodies(p1)).toHaveLength(30);
    expect(p1.body.nextCursor).toEqual(expect.any(String));
  });

  it('pages newest-first without duplicates or skips while posts are added', async () => {
    await liftLimits('rateLimit.post.perMinute', 'rateLimit.post.perDay');
    await db.appConfiguration.create({ data: { key: 'feed.pageSize', value: 15 } });
    invalidateConfigCache();

    for (let i = 1; i <= 20; i++) await post(alice, `post ${i}`);
    const p1 = await feed(bob);
    expect(bodies(p1)).toHaveLength(15);
    expect(bodies(p1)[0]).toBe('post 20');
    for (let i = 21; i <= 23; i++) await post(alice, `post ${i}`); // arrive while scrolling
    const p2 = await feed(bob, FIVE_POINTS, { cursor: p1.body.nextCursor });
    expect(bodies(p2)).toEqual(['post 5', 'post 4', 'post 3', 'post 2', 'post 1']);
    expect(p2.body.nextCursor).toBeNull();
    expect(bodies(await feed(bob))[0]).toBe('post 23'); // a refresh shows the new ones
  });

  // 🔒 MS2: posting is rate-limited per user (2 a minute by default).
  it('the third post within a minute is refused', async () => {
    expect((await post(alice, 'one')).status).toBe(201);
    expect((await post(alice, 'two')).status).toBe(201);
    const third = await post(alice, 'three');
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
  });

  it('rejects a tampered page bookmark', async () => {
    expect((await feed(bob, FIVE_POINTS, { cursor: 'not-a-cursor' })).status).toBe(400);
  });

  it('"top" orders by score (P3.6)', async () => {
    const a = (await post(alice, 'meh')).body.post.id;
    const b = (await post(alice, 'great')).body.post.id;
    await call(votePUT as H, 'PUT', {
      token: bob,
      id: b,
      body: { reading: reading(FIVE_POINTS), value: 1 },
    });
    await call(votePUT as H, 'PUT', {
      token: bob,
      id: a,
      body: { reading: reading(FIVE_POINTS), value: -1 },
    });
    expect(bodies(await feed(bob, FIVE_POINTS, { sort: 'top' }))).toEqual(['great', 'meh']);
  });

  // P3.10: stored and returned as plain text, never transformed into markup.
  it('keeps text exactly as typed (plain text) and rejects control characters', async () => {
    const text = '<script>alert(1)</script> & <b>bold</b>';
    const r = await post(alice, text);
    expect(r.body.post.body).toBe(text);
    expect((await post(alice, 'bad\u0000char')).status).toBe(400);
  });
});

describe('comments (P3.3, D20)', () => {
  const comment = (
    token: string,
    postId: string,
    body: string,
    parentCommentId?: string,
    at = FIVE_POINTS,
  ) =>
    call(commentPOST as H, 'POST', {
      token,
      id: postId,
      body: { reading: reading(at), body, ...(parentCommentId ? { parentCommentId } : {}) },
    });
  const detail = (token: string, id: string, at = FIVE_POINTS) =>
    call(postDetailPOST as H, 'POST', { token, id, body: { reading: reading(at) } });

  // ✅ DV3: replies appear under the correct parent, in thread order.
  it('threads replies under their parent and counts comments', async () => {
    const p = (await post(alice, 'Q')).body.post.id;
    const c1 = (await comment(bob, p, 'first')).body.id;
    const c2 = (await comment(alice, p, 'second')).body.id;
    await comment(alice, p, 'reply to first', c1);
    await comment(bob, p, 'reply to second', c2);
    const d = await detail(bob, p);
    expect(d.body.comments.map((c: { body: string; depth: number }) => [c.body, c.depth])).toEqual([
      ['first', 0],
      ['reply to first', 1],
      ['second', 0],
      ['reply to second', 1],
    ]);
    expect(d.body.post.commentCount).toBe(4);
  });

  it('commenting needs to be within 0.3 mi (528 yd) of the post (D71)', async () => {
    const p = (await post(alice, 'Q')).body.post.id;
    expect((await comment(bob, p, 'from up the street', undefined, NEAR)).status).toBe(201);
    const far = await comment(bob, p, 'from Memorial Park', undefined, MEMORIAL);
    expect(far.body.error.code).toBe('LOCATION_TOO_FAR');
    expect(far.body.error.message).toBe('Get within 530 yd of this post to take part.'); // shown rounded
  });

  // D105: post → comment → reply, nothing deeper.
  it('a reply to a reply goes under the same comment and tags the person (no deeper)', async () => {
    await liftLimits('rateLimit.comment.perMinute');
    const p = (await post(alice, 'Q')).body.post.id;
    const other = (await post(alice, 'other')).body.post.id;
    const top = (await comment(bob, p, 'top')).body.id;
    const r1 = (await comment(alice, p, 'reply', top)).body.id;
    await comment(bob, p, 'answering alice', r1); // tagged by the server
    await comment(bob, p, '@ALICE_P already tagged', r1); // not tagged twice
    await comment(alice, p, 'my own follow-up', r1); // answering yourself: no tag
    const rows = await db.comment.findMany({
      where: { generalPostId: p },
      orderBy: { createdAt: 'asc' },
      select: { body: true, depth: true, parentCommentId: true },
    });
    expect(rows.map((c) => [c.body, c.depth, c.parentCommentId])).toEqual([
      ['top', 0, null],
      ['reply', 1, top],
      ['@alice_p answering alice', 1, top],
      ['@ALICE_P already tagged', 1, top],
      ['my own follow-up', 1, top],
    ]);
    // D156 (was "tags never notify"): alice hears about the comment on her post and the two
    // replies to her comment; bob about alice's reply. Her own follow-up notifies no one.
    const notes = await db.notification.findMany({
      select: { userId: true, type: true },
      orderBy: { createdAt: 'asc' },
    });
    const forAlice = notes.filter((n) => n.userId === aliceId).map((n) => n.type);
    const forOthers = notes.filter((n) => n.userId !== aliceId).map((n) => n.type);
    expect(forAlice).toEqual(['POST_COMMENT', 'COMMENT_REPLY', 'COMMENT_REPLY']);
    expect(forOthers).toEqual(['COMMENT_REPLY']); // bob, for alice's reply
    const foreign = (await comment(bob, other, 'elsewhere')).body.id;
    expect((await comment(bob, p, 'x', foreign)).body.error.code).toBe('INVALID_PARENT');
  });

  // 🔒 D105: the server closes a post at the comment limit, replies included.
  it('locks a post once it reaches the comment limit', async () => {
    await liftLimits('rateLimit.comment.perMinute');
    await db.appConfiguration.create({ data: { key: 'comments.limitPerPost', value: 3 } });
    invalidateConfigCache();
    const p = (await post(alice, 'Q')).body.post.id;
    const c = (await comment(bob, p, 'one')).body.id;
    await comment(alice, p, 'two', c);
    expect((await detail(bob, p)).body.commentsLocked).toBe(false);
    const last = (await comment(bob, p, 'three')).body.id;
    const locked = await comment(alice, p, 'four', c);
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('COMMENTS_LOCKED');
    expect((await detail(bob, p)).body).toMatchObject({
      commentsLocked: true,
      post: { commentCount: 3 },
    });
    // A deleted (or removed) comment frees its place.
    await call(commentDELETE as H, 'DELETE', { token: bob, id: last });
    expect((await comment(alice, p, 'four', c)).status).toBe(201);
  });

  it('a deleted comment stays as a placeholder so replies keep their context', async () => {
    const p = (await post(alice, 'Q')).body.post.id;
    const c = (await comment(bob, p, 'oops')).body.id;
    await comment(alice, p, 'reply', c);
    expect((await call(commentDELETE as H, 'DELETE', { token: bob, id: c })).status).toBe(200);
    const d = await detail(alice, p);
    expect(d.body.comments[0]).toMatchObject({ body: null, status: 'deleted' });
    expect(d.body.comments[1]).toMatchObject({ body: 'reply', depth: 1 });
    expect(d.body.post.commentCount).toBe(1);
  });
});

describe('votes (P3.4, D6)', () => {
  const vote = (token: string, id: string, value: number, at = FIVE_POINTS) =>
    call(votePUT as H, 'PUT', { token, id, body: { reading: reading(at), value } });

  // ✅ DV4 / DV5: one vote per user per item; totals are computed by the server.
  it('sets, changes, repeats and removes a vote with correct totals', async () => {
    const p = (await post(alice, 'vote me')).body.post.id;
    expect((await vote(bob, p, 1)).body).toEqual({ score: 1, upCount: 1, downCount: 0, myVote: 1 });
    expect((await vote(bob, p, -1)).body).toEqual({
      score: -1,
      upCount: 0,
      downCount: 1,
      myVote: -1,
    });
    expect((await vote(bob, p, -1)).body).toEqual({
      score: -1,
      upCount: 0,
      downCount: 1,
      myVote: -1,
    });
    expect((await vote(bob, p, 0)).body).toEqual({ score: 0, upCount: 0, downCount: 0, myVote: 0 });
    expect(await db.vote.count()).toBe(0);
  });

  it('rapid repeated taps still count once', async () => {
    const p = (await post(alice, 'spam tap')).body.post.id;
    await Promise.all(Array.from({ length: 6 }, () => vote(bob, p, 1)));
    const row = await db.generalPost.findUniqueOrThrow({ where: { id: p } });
    expect([row.score, row.upCount]).toEqual([1, 1]);
    expect(await db.vote.count()).toBe(1);
  });

  // 🔒 Totals can't be sent by the client, and voting is radius-bound.
  it('rejects client-sent totals and far-away votes', async () => {
    const p = (await post(alice, 'x')).body.post.id;
    const r = await call(votePUT as H, 'PUT', {
      token: bob,
      id: p,
      body: { reading: reading(FIVE_POINTS), value: 1, score: 1000 },
    });
    expect(r.status).toBe(400);
    expect((await vote(bob, p, 2)).status).toBe(400);
    expect((await vote(bob, p, 1, DOWNTOWN)).body.error.code).toBe('LOCATION_TOO_FAR');
  });

  it('comments can be voted on too', async () => {
    const p = (await post(alice, 'Q')).body.post.id;
    const c = (
      await call(commentPOST as H, 'POST', {
        token: bob,
        id: p,
        body: { reading: reading(FIVE_POINTS), body: 'A' },
      })
    ).body.id;
    const r = await call(commentVotePUT as H, 'PUT', {
      token: alice,
      id: c,
      body: { reading: reading(FIVE_POINTS), value: 1 },
    });
    expect(r.body.score).toBe(1);
  });
});

describe('edit and delete own content (P3.8)', () => {
  // 🔒 IDOR: someone else's post looks like it doesn't exist.
  it('only the author can edit or delete; others get 404', async () => {
    const p = (await post(alice, 'mine')).body.post.id;
    expect(
      (await call(postPATCH as H, 'PATCH', { token: bob, id: p, body: { body: 'hacked' } })).status,
    ).toBe(404);
    expect((await call(postDELETE as H, 'DELETE', { token: bob, id: p })).status).toBe(404);

    const e = await call(postPATCH as H, 'PATCH', {
      token: alice,
      id: p,
      body: { body: 'edited' },
    });
    expect(e.body.post).toMatchObject({ body: 'edited' });
    expect(e.body.post.editedAt).not.toBeNull();
    expect((await call(postDELETE as H, 'DELETE', { token: alice, id: p })).status).toBe(200);
    expect(bodies(await feed(bob))).toEqual([]);
  });
});

describe('business rooms (P3.2, D19)', () => {
  const roomPost = (token: string, body: string, at = FIVE_POINTS) =>
    call(roomPostPOST as H, 'POST', { token, id: cafeId, body: { reading: reading(at), body } });
  const room = (token: string, at = FIVE_POINTS) =>
    call(roomListPOST as H, 'POST', { token, id: cafeId, body: { reading: reading(at) } });

  // ✅ DV2: business posts belong to their place; ✅ DV1: rooms and the general feed are separate.
  it('posts in a room stay in that room and never appear in the general feed', async () => {
    const r = await roomPost(alice, 'Best latte in town');
    expect(r.status).toBe(201);
    expect(r.body.post).toMatchObject({
      kind: 'business',
      place: { id: cafeId, name: 'Bold Bean' },
    });
    await post(alice, 'general chatter');
    expect(bodies(await room(bob))).toEqual(['Best latte in town']);
    expect(bodies(await feed(bob))).toEqual(['general chatter']);
  });

  // 🔒 D19: reading and writing a room both need 0.3 mi.
  it('reading and posting require being within 0.3 mi of the place', async () => {
    expect((await room(bob, MEMORIAL)).body.error.code).toBe('LOCATION_TOO_FAR');
    expect((await roomPost(bob, 'from afar', MEMORIAL)).body.error.code).toBe('LOCATION_TOO_FAR');
    const p = (await roomPost(alice, 'here')).body.post.id;
    const d = await call(bizDetailPOST as H, 'POST', {
      token: bob,
      id: p,
      body: { reading: reading(MEMORIAL) },
    });
    expect(d.body.error.code).toBe('LOCATION_TOO_FAR');
  });

  it('keeps the place post count in step and shows it in search (D41)', async () => {
    const p1 = (await roomPost(alice, 'one')).body.post.id;
    await roomPost(bob, 'two');
    const search = async () =>
      (await call(searchPOST as H, 'POST', { token: bob, body: { reading: reading(FIVE_POINTS) } }))
        .body.places[0].postCount;
    expect(await search()).toBe(2);
    await call(bizDELETE as H, 'DELETE', { token: alice, id: p1 });
    expect(await search()).toBe(1);
  });

  it('room comments and votes use the 0.3 mi rule', async () => {
    const p = (await roomPost(alice, 'q')).body.post.id;
    const near = await call(bizCommentPOST as H, 'POST', {
      token: bob,
      id: p,
      body: { reading: reading(FIVE_POINTS), body: 'a' },
    });
    expect(near.status).toBe(201);
    const far = await call(bizVotePUT as H, 'PUT', {
      token: bob,
      id: p,
      body: { reading: reading(MEMORIAL), value: 1 },
    });
    expect(far.body.error.code).toBe('LOCATION_TOO_FAR');
  });
});

describe('blocking (P3.9)', () => {
  it('hides content between users who blocked each other, both ways', async () => {
    await post(alice, 'from alice');
    const bobUser = await db.user.findFirstOrThrow({ where: { username: 'bob_p' } });
    await call(createPostPOST as H, 'POST', {
      token: bob,
      body: { reading: reading(FIVE_POINTS), body: 'from bob' },
    });
    await db.userBlock.create({ data: { blockerId: aliceId, blockedId: bobUser.id } });
    expect(bodies(await feed(alice))).toEqual(['from alice']);
    expect(bodies(await feed(bob))).toEqual(['from bob']);
  });
});

// D105: your own posts open from anywhere; their comments follow the normal reading rule.
describe('your own posts, from anywhere (D105)', () => {
  const detail = (route: unknown, token: string, id: string, at: typeof FIVE_POINTS) =>
    call(route as H, 'POST', { token, id, body: { reading: reading(at) } });
  const roomPost = (token: string, body: string) =>
    call(roomPostPOST as H, 'POST', {
      token,
      id: cafeId,
      body: { reading: reading(FIVE_POINTS), body },
    });

  it('the author reads, edits and deletes their post far away, without its comments', async () => {
    const area = (await post(alice, 'area post')).body.post.id;
    const room = (await roomPost(alice, 'room post')).body.post.id;
    await call(commentPOST as H, 'POST', {
      token: bob,
      id: area,
      body: { reading: reading(FIVE_POINTS), body: 'a comment' },
    });
    // Near it, comments show as usual.
    expect((await detail(postDetailPOST, alice, area, FIVE_POINTS)).body).toMatchObject({
      commentsHidden: false,
      comments: [{ body: 'a comment' }],
    });
    // Outside Duval (area post) and across town (place post).
    const a = await detail(postDetailPOST, alice, area, ORANGE_PARK);
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({
      post: { body: 'area post' },
      comments: [],
      commentsHidden: true,
    });
    const b = await detail(bizDetailPOST, alice, room, DOWNTOWN);
    expect(b.body).toMatchObject({ post: { body: 'room post' }, commentsHidden: true });
    const edited = await call(postPATCH as H, 'PATCH', {
      token: alice,
      id: area,
      body: { body: 'area post, edited' },
    });
    expect(edited.status).toBe(200);
    expect((await call(bizDELETE as H, 'DELETE', { token: alice, id: room })).status).toBe(200);
  });

  // 🔒 Only the author: everyone else still needs to be in range.
  it('other people still need the usual location', async () => {
    const area = (await post(alice, 'area post')).body.post.id;
    const room = (await roomPost(alice, 'room post')).body.post.id;
    expect((await detail(bizDetailPOST, bob, room, DOWNTOWN)).body.error.code).toBe(
      'LOCATION_TOO_FAR',
    );
    const far = await detail(postDetailPOST, bob, area, ORANGE_PARK);
    expect(far.status).not.toBe(200);
    expect(far.body.error.code).toMatch(/^LOCATION_/);
  });

  it('your own profile lists area and place posts from anywhere; others’ profiles don’t', async () => {
    await post(alice, 'area post');
    await roomPost(alice, 'room post');
    const profile = (token: string, at: typeof FIVE_POINTS) =>
      call(profilePOST as H, 'POST', {
        token,
        params: { username: 'alice_p' },
        body: { reading: reading(at) },
      });
    const mine = await profile(alice, ORANGE_PARK);
    expect(mine.status).toBe(200);
    expect(mine.body.profile.postCount).toBe(2);
    expect(mine.body.posts.map((p: { body: string }) => p.body).sort()).toEqual([
      'area post',
      'room post',
    ]);
    expect(
      (await profile(bob, FIVE_POINTS)).body.posts.map((p: { body: string }) => p.body),
    ).toEqual(['area post']);
    expect((await profile(bob, ORANGE_PARK)).body.error.code).toMatch(/^LOCATION_/);
  });
});

// D112: profiles show 10 posts at a time with "Load more posts".
describe('profile pages (D112)', () => {
  it('10 posts at a time, newest first, with a bookmark for the next 10', async () => {
    for (let i = 1; i <= 12; i++) {
      await db.$executeRaw`
        INSERT INTO "GeneralPost" (id, "authorId", body, location, "createdAt", "updatedAt")
        VALUES (uuid_v7(), ${aliceId}::uuid, ${`post ${i}`},
                ST_SetSRID(ST_MakePoint(-81.6853, 30.3149), 4326)::geography,
                ${new Date(Date.now() - (13 - i) * 60_000)}, now())`;
    }
    const page = (token: string, cursor?: string) =>
      call(profilePOST as H, 'POST', {
        token,
        params: { username: 'alice_p' },
        body: { reading: reading(FIVE_POINTS), ...(cursor ? { cursor } : {}) },
      });
    for (const token of [alice, bob]) {
      const first = await page(token);
      expect(first.body.posts.map((p: { body: string }) => p.body)).toEqual(
        Array.from({ length: 10 }, (_, i) => `post ${12 - i}`),
      );
      expect(first.body.nextCursor).toEqual(expect.any(String));
      const second = await page(token, first.body.nextCursor);
      expect(second.body.posts.map((p: { body: string }) => p.body)).toEqual(['post 2', 'post 1']);
      expect(second.body.nextCursor).toBeNull();
    }
    expect((await page(alice, 'not-a-bookmark')).status).toBe(400);
  });
});

// D115: where your posts were made, and the comment box only where commenting works.
describe('your posts on your profile, and commenting from afar (D115)', () => {
  it('a general post read from across town shows its comments but can’t be commented on', async () => {
    const id = (await post(alice, 'mine')).body.post.id;
    const open = (at: typeof FIVE_POINTS) =>
      call(postDetailPOST as H, 'POST', { token: alice, id, body: { reading: reading(at) } });
    expect((await open(FIVE_POINTS)).body).toMatchObject({
      canComment: true,
      commentsHidden: false,
    });
    expect((await open(DOWNTOWN)).body).toMatchObject({ canComment: false, commentsHidden: false });
  });

  it('your own profile says where each post was made: the neighborhood or the place', async () => {
    await post(alice, 'area post');
    await call(roomPostPOST as H, 'POST', {
      token: alice,
      id: cafeId,
      body: { reading: reading(FIVE_POINTS), body: 'room post' },
    });
    const mine = await call(profilePOST as H, 'POST', {
      token: alice,
      params: { username: 'alice_p' },
      body: { reading: reading(FIVE_POINTS) },
    });
    const byBody = Object.fromEntries(
      mine.body.posts.map((p: { body: string }) => [p.body, p]),
    ) as Record<string, { area?: string | null; place: { name: string } | null }>;
    expect(byBody['area post']!.area).toEqual(expect.any(String));
    expect(byBody['room post']!.place?.name).toBe('Bold Bean');
    // Someone else's view of the profile doesn't carry the neighborhood.
    const theirs = await call(profilePOST as H, 'POST', {
      token: bob,
      params: { username: 'alice_p' },
      body: { reading: reading(FIVE_POINTS) },
    });
    expect(theirs.body.posts[0].area).toBeUndefined();
  });
});
