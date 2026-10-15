import { beforeEach, describe, expect, it } from 'vitest';
import { POST as guestsPOST } from '@/app/api/v1/guests/route';
import { GET as sessionGET } from '@/app/api/v1/session/route';
import { POST as installPOST } from '@/app/api/v1/installations/route';
import { POST as feedPOST } from '@/app/api/v1/feed/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { POST as postDetailPOST } from '@/app/api/v1/posts/[id]/route';
import { POST as commentPOST } from '@/app/api/v1/posts/[id]/comments/route';
import { PUT as votePUT } from '@/app/api/v1/posts/[id]/vote/route';
import { POST as roomListPOST } from '@/app/api/v1/places/[id]/posts/list/route';
import { POST as searchPOST } from '@/app/api/v1/places/search/route';
import { PUT as favPUT } from '@/app/api/v1/places/[id]/favorite/route';
import { GET as meGET } from '@/app/api/v1/me/route';
import { PATCH as prefsPATCH } from '@/app/api/v1/me/preferences/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { INSTALLATION_HEADER } from '@/server/installations';
import { runMaintenance } from '@/server/jobs/maintenance';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

const HERE = { latitude: 30.3149, longitude: -81.6853 };
const OUTSIDE = { latitude: 30.1661, longitude: -81.7065 };
const reading = (p = HERE) => ({ ...p, accuracyMeters: 10, timestamp: Date.now() - 2_000 });
const DAY = 86_400_000;

let member: string;
let postId: string;
let placeId: string;

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  await importServiceArea(db, readBoundaryFile());
  await importOsmPlaces(db, [
    {
      type: 'node',
      id: 1,
      lat: 30.315,
      lon: -81.686,
      tags: { amenity: 'cafe', name: 'Guest Cafe' },
    },
  ]);
  placeId = (await db.businessPlace.findFirstOrThrow()).id;
  member = (
    await createSession(
      (await createTestUser('member_g', { emailVerifiedAt: new Date() })).id,
      'MOBILE',
    )
  ).token;
  postId = (
    await call(postsPOST as H, 'POST', {
      token: member,
      body: { reading: reading(), body: 'hello all' },
    })
  ).body.post.id;
});

async function installation() {
  return (await call(installPOST as H, 'POST', { body: {} })).body.installationToken as string;
}
async function startGuest(inst?: string) {
  return call(guestsPOST as H, 'POST', {
    body: {},
    headers: inst ? { [INSTALLATION_HEADER]: inst } : {},
  });
}
async function guestToken() {
  const r = await startGuest(await installation());
  expect(r.status).toBe(201);
  return r.body.token as string;
}

describe('starting guest mode (P4.1, P4.3, P4.6)', () => {
  it('needs an app installation, and never returns the internal guest ID', async () => {
    expect((await startGuest()).body.error.code).toBe('INSTALLATION_REQUIRED');
    const r = await startGuest(await installation());
    expect(r.status).toBe(201);
    expect(Object.keys(r.body).sort()).toEqual(['guest', 'token']);
    const g = await db.guestSession.findFirstOrThrow();
    expect(r.raw).not.toContain(g.id);
    expect(r.body.guest).toMatchObject({ daysLeft: 30, expiringSoon: false });
  });

  it('one guest per installation: asking again rotates the token, the old one stops working', async () => {
    const inst = await installation();
    const first = (await startGuest(inst)).body.token;
    const second = (await startGuest(inst)).body.token;
    expect(await db.guestSession.count()).toBe(1);
    expect((await call(sessionGET as H, 'GET', { token: first })).status).toBe(401);
    expect((await call(sessionGET as H, 'GET', { token: second })).body.kind).toBe('guest');
  });

  it('is rate-limited per installation (4th in a day is 429)', async () => {
    const inst = await installation();
    for (let i = 0; i < 3; i++) expect((await startGuest(inst)).status).toBe(201);
    expect((await startGuest(inst)).status).toBe(429);
  });

  // 🔒 MS4: a banned device can't come back as a new guest.
  it('a banned installation, or one with a banned guest, cannot start guest mode', async () => {
    const inst = await installation();
    await startGuest(inst);
    await db.guestSession.updateMany({ data: { status: 'BANNED', bannedAt: new Date() } });
    expect((await startGuest(inst)).body.error.code).toBe('INSTALLATION_BANNED');
    const inst2 = await installation();
    await db.installation.updateMany({
      where: { guestSessions: { none: {} } },
      data: { bannedAt: new Date() },
    });
    expect((await startGuest(inst2)).body.error.code).toBe('INSTALLATION_BANNED');
  });
});

describe('what guests can do (P4.2)', () => {
  it('reads the area feed and a general post, from inside Duval only', async () => {
    const g = await guestToken();
    const feed = await call(feedPOST as H, 'POST', { token: g, body: { reading: reading() } });
    expect(feed.body.posts.map((p: { body: string }) => p.body)).toEqual(['hello all']);
    expect(feed.body.posts[0].myVote).toBe(0);
    // A different guest: the same one jumping 20 km in seconds would be impossible travel.
    const g2 = await guestToken();
    const out = await call(feedPOST as H, 'POST', {
      token: g2,
      body: { reading: reading(OUTSIDE) },
    });
    expect(out.body.error.code).toBe('LOCATION_OUTSIDE_AREA');
    const d = await call(postDetailPOST as H, 'POST', {
      token: g,
      id: postId,
      body: { reading: reading() },
    });
    expect(d.status).toBe(200);
  });

  // 🔒 P4.3: comments show GUEST, never the guest's internal ID.
  it('comments on a nearby general post, shown as GUEST with no internal ID', async () => {
    const g = await guestToken();
    const c = await call(commentPOST as H, 'POST', {
      token: g,
      id: postId,
      body: { reading: reading(), body: 'hi from a guest' },
    });
    expect(c.status).toBe(201);
    const asGuest = await call(postDetailPOST as H, 'POST', {
      token: g,
      id: postId,
      body: { reading: reading() },
    });
    expect(asGuest.body.comments[0]).toMatchObject({
      body: 'hi from a guest',
      author: { guest: true },
      isMine: true,
    });
    const asMember = await call(postDetailPOST as H, 'POST', {
      token: member,
      id: postId,
      body: { reading: reading() },
    });
    expect(asMember.body.comments[0]).toMatchObject({ author: { guest: true }, isMine: false });
    const guestRow = await db.guestSession.findFirstOrThrow();
    expect(asMember.raw).not.toContain(guestRow.id);
    expect(asMember.raw).not.toContain(guestRow.installationId);
  });

  // 🔒 D51: admins can make guests read-only; the server refuses, not just the app.
  it('when guest.commentsEnabled is false, guests can read but not comment', async () => {
    await db.appConfiguration.create({ data: { key: 'guest.commentsEnabled', value: false } });
    invalidateConfigCache();
    const g = await guestToken();
    const c = await call(commentPOST as H, 'POST', {
      token: g,
      id: postId,
      body: { reading: reading(), body: 'hi from a guest' },
    });
    expect(c.status).toBe(403);
    expect(c.body.error.code).toBe('GUEST_NOT_ALLOWED');
    const s = await call(sessionGET as H, 'GET', { token: g });
    expect(s.body.guest.canComment).toBe(false);
    const read = await call(postDetailPOST as H, 'POST', {
      token: g,
      id: postId,
      body: { reading: reading() },
    });
    expect(read.status).toBe(200);
    expect(await db.comment.count()).toBe(0);
  });

  it('guest comments have their own, lower limit (4th in a minute is 429)', async () => {
    const g = await guestToken();
    for (let i = 0; i < 3; i++) {
      expect(
        (
          await call(commentPOST as H, 'POST', {
            token: g,
            id: postId,
            body: { reading: reading(), body: `c${i}` },
          })
        ).status,
      ).toBe(201);
    }
    expect(
      (
        await call(commentPOST as H, 'POST', {
          token: g,
          id: postId,
          body: { reading: reading(), body: 'c4' },
        })
      ).status,
    ).toBe(429);
  });

  // 🔒 ✅A3: no top-level posts, votes, business rooms, directory or account settings.
  it.each([
    ['create a post', postsPOST, 'POST', () => ({ reading: reading(), body: 'x' }), false],
    ['vote', votePUT, 'PUT', () => ({ reading: reading(), value: 1 }), true],
    ['read a business room', roomListPOST, 'POST', () => ({ reading: reading() }), 'place'],
    ['search places', searchPOST, 'POST', () => ({ reading: reading() }), false],
    ['save a favorite', favPUT, 'PUT', () => ({}), 'place'],
    ['change radius settings', prefsPATCH, 'PATCH', () => ({ generalRadiusMiles: 0.5 }), false],
  ] as const)('cannot %s (403 GUEST_NOT_ALLOWED)', async (_l, handler, method, body, id) => {
    const g = await guestToken();
    const r = await call(handler as H, method, {
      token: g,
      body: body(),
      id: id === true ? postId : id === 'place' ? placeId : undefined,
    });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('GUEST_NOT_ALLOWED');
  });

  it('cannot open account endpoints meant for registered users', async () => {
    const g = await guestToken();
    expect((await call(meGET as H, 'GET', { token: g })).body.error.code).toBe('GUEST_NOT_ALLOWED');
  });
});

describe('guest expiry (P4.4, ✅A4)', () => {
  it('each use pushes expiry out; the app is warned when it gets close', async () => {
    const g = await guestToken();
    await db.guestSession.updateMany({
      data: {
        expiresAt: new Date(Date.now() + 3 * DAY),
        lastActiveAt: new Date(Date.now() - 27 * DAY),
      },
    });
    // Reading the session doesn't count as activity in this test's data, so check the warning first.
    const s = await call(sessionGET as H, 'GET', { token: g });
    expect(s.body.guest).toMatchObject({ expiringSoon: true });
    // Activity (reading the feed) extends expiry back to 30 days.
    await call(feedPOST as H, 'POST', { token: g, body: { reading: reading() } });
    const after = await db.guestSession.findFirstOrThrow();
    expect(after.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
  });

  it('after 30 days without activity the guest is expired and the token stops working', async () => {
    const g = await guestToken();
    await db.guestSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(
      (await call(feedPOST as H, 'POST', { token: g, body: { reading: reading() } })).body.error
        .code,
    ).toBe('GUEST_EXPIRED');
    const report = await runMaintenance(new Date());
    expect(report?.guestsExpired).toBe(1);
    expect((await db.guestSession.findFirstOrThrow()).status).toBe('EXPIRED');
  });
});

describe('guest data retention (P4.5, D14, D17, ✅A5)', () => {
  async function guestComment(body: string, at?: Date) {
    const g = await guestToken();
    const id = (
      await call(commentPOST as H, 'POST', {
        token: g,
        id: postId,
        body: { reading: reading(), body },
      })
    ).body.id;
    if (at) await db.comment.update({ where: { id }, data: { createdAt: at } });
    return id as string;
  }

  it('expired guest data is deleted after 180 days, but the GUEST label stays on comments', async () => {
    await guestComment('still here');
    await db.guestSession.updateMany({
      data: { status: 'EXPIRED', expiresAt: new Date(Date.now() - 181 * DAY) },
    });
    expect((await runMaintenance(new Date()))?.guestsPurged).toBe(1);
    const d = await call(postDetailPOST as H, 'POST', {
      token: member,
      id: postId,
      body: { reading: reading() },
    });
    expect(d.body.comments[0]).toMatchObject({ body: 'still here', author: { guest: true } });
  });

  // 🔒 Banned guests are kept so the ban keeps working (P4.6).
  it('banned guests are not purged', async () => {
    await guestToken();
    await db.guestSession.updateMany({
      data: {
        status: 'EXPIRED',
        bannedAt: new Date(),
        expiresAt: new Date(Date.now() - 400 * DAY),
      },
    });
    expect((await runMaintenance(new Date()))?.guestsPurged).toBe(0);
    expect(await db.guestSession.count()).toBe(1);
  });

  it('guest comments are shown for a year, then removed (blanked if they have replies)', async () => {
    const recent = await guestComment('this year', new Date(Date.now() - 300 * DAY));
    const old = await guestComment('last year', new Date(Date.now() - 366 * DAY));
    const oldWithReply = await guestComment('old with reply', new Date(Date.now() - 366 * DAY));
    await call(commentPOST as H, 'POST', {
      token: member,
      id: postId,
      body: { reading: reading(), body: 'a reply', parentCommentId: oldWithReply },
    });
    const r = await runMaintenance(new Date());
    expect(r).toMatchObject({ guestCommentsDeleted: 1, guestCommentsBlanked: 1 });
    expect(await db.comment.findUnique({ where: { id: old } })).toBeNull();
    expect(await db.comment.findUniqueOrThrow({ where: { id: recent } })).toMatchObject({
      status: 'VISIBLE',
    });
    expect(await db.comment.findUniqueOrThrow({ where: { id: oldWithReply } })).toMatchObject({
      status: 'DELETED',
      body: '',
    });
    // The post's comment count only counts what's still visible: "this year" + "a reply".
    expect((await db.generalPost.findUniqueOrThrow({ where: { id: postId } })).commentCount).toBe(
      2,
    );
  });

  it('a comment with an open report is kept until the report is resolved (D17 hold)', async () => {
    const old = await guestComment('reported', new Date(Date.now() - 400 * DAY));
    await db.report.create({ data: { commentId: old, reason: 'HARASSMENT' } });
    await runMaintenance(new Date());
    expect(await db.comment.findUnique({ where: { id: old } })).not.toBeNull();
  });
});
