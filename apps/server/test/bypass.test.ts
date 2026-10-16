/**
 * P7.2 bypass pass (🔒): the attacks the spec calls out, tried against the real route
 * handlers in one place. Each must fail and change nothing. Many are also covered
 * near their features; this file is the single checklist.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as registerPOST } from '@/app/api/v1/auth/register/route';
import { POST as feedPOST } from '@/app/api/v1/feed/route';
import { GET as meGET } from '@/app/api/v1/me/route';
import { POST as meAppealsPOST } from '@/app/api/v1/me/appeals/route';
import { POST as deletePOST } from '@/app/api/v1/me/delete/route';
import { PATCH as prefsPATCH } from '@/app/api/v1/me/preferences/route';
import { PATCH as profilePATCH } from '@/app/api/v1/me/profile/route';
import { GET as myReportsGET } from '@/app/api/v1/me/reports/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { DELETE as postDELETE, PATCH as postPATCH } from '@/app/api/v1/posts/[id]/route';
import { POST as commentPOST } from '@/app/api/v1/posts/[id]/comments/route';
import { PATCH as commentPATCH } from '@/app/api/v1/comments/[id]/route';
import { PUT as votePUT } from '@/app/api/v1/posts/[id]/vote/route';
import { POST as reportPOST } from '@/app/api/v1/reports/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { issueStrike } from '@/server/moderation/enforcement';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

const DOWNTOWN = { latitude: 30.3149, longitude: -81.6853 };
const ORANGE_PARK = { latitude: 30.1661, longitude: -81.7065 };
const ATLANTA = { latitude: 33.749, longitude: -84.388 };
const fresh = (p = DOWNTOWN) => ({ ...p, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let alice: { id: string; token: string };
let mallory: { id: string; token: string };
let postId: string;
let commentId: string;

async function person(name: string) {
  const u = await createTestUser(name, { emailVerifiedAt: new Date() });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  invalidateConfigCache();
  await importServiceArea(db, readBoundaryFile());
  alice = await person('alice_bp');
  mallory = await person('mallory_bp');
  postId = (
    await call(postsPOST as H, 'POST', {
      token: alice.token,
      body: { reading: fresh(), body: 'Alice’s original post' },
    })
  ).body.post.id;
  commentId = (
    await call(commentPOST as H, 'POST', {
      token: alice.token,
      id: postId,
      body: { reading: fresh(), body: 'Alice’s comment' },
    })
  ).body.id;
});

describe('client-sent privileged fields are refused (strict schemas)', () => {
  it.each([
    [
      'register as admin',
      registerPOST,
      'POST',
      undefined,
      {
        username: 'evil_reg',
        email: 'e@x.test',
        password: 'correct horse battery',
        birthYear: 1990,
        acceptTerms: true,
        confirmAdult: true,
        role: 'ADMIN',
      },
    ],
    [
      'post with a score',
      postsPOST,
      'POST',
      undefined,
      { reading: fresh(), body: 'hi', score: 9999 },
    ],
    [
      'post as someone else',
      postsPOST,
      'POST',
      undefined,
      { reading: fresh(), body: 'hi', authorId: 'x' },
    ],
    [
      'post with a status',
      postsPOST,
      'POST',
      undefined,
      { reading: fresh(), body: 'hi', status: 'VISIBLE' },
    ],
    [
      'post with a location',
      postsPOST,
      'POST',
      undefined,
      { reading: fresh(), body: 'hi', location: 'POINT(0 0)' },
    ],
    ['vote with totals', votePUT, 'PUT', 'post', { reading: fresh(), value: 1, upCount: 500 }],
    ['vote of +5', votePUT, 'PUT', 'post', { reading: fresh(), value: 5 }],
    [
      'comment as a guest author',
      commentPOST,
      'POST',
      'post',
      { reading: fresh(), body: 'x', authorKind: 'GUEST' },
    ],
    ['profile with a role', profilePATCH, 'PATCH', undefined, { bio: 'x', role: 'ADMIN' }],
    [
      'preferences with a status',
      prefsPATCH,
      'PATCH',
      undefined,
      { generalRadiusMiles: 1, status: 'ACTIVE' },
    ],
  ] as const)('%s → 400, nothing changes', async (_l, handler, method, id, body) => {
    const before = await db.generalPost.findUniqueOrThrow({ where: { id: postId } });
    const r = await call(handler as H, method, {
      token: mallory.token,
      id: id === 'post' ? postId : undefined,
      body,
    });
    expect(r.status).toBe(400);
    expect(await db.user.count({ where: { role: 'ADMIN' } })).toBe(0);
    const after = await db.generalPost.findUniqueOrThrow({ where: { id: postId } });
    expect(after.score).toBe(before.score);
    expect(after.upCount).toBe(before.upCount);
  });

  it('score and counters only move through real votes', async () => {
    await call(votePUT as H, 'PUT', {
      token: mallory.token,
      id: postId,
      body: { reading: fresh(), value: 1 },
    });
    await call(votePUT as H, 'PUT', {
      token: mallory.token,
      id: postId,
      body: { reading: fresh(), value: 1 },
    });
    const p = await db.generalPost.findUniqueOrThrow({ where: { id: postId } });
    expect([p.score, p.upCount]).toEqual([1, 1]);
  });
});

describe('swapped IDs: acting on someone else’s things', () => {
  it('can’t edit or delete another person’s post or comment (404, unchanged)', async () => {
    expect(
      (
        await call(postPATCH as H, 'PATCH', {
          token: mallory.token,
          id: postId,
          body: { body: 'pwned' },
        })
      ).status,
    ).toBe(404);
    expect(
      (await call(postDELETE as H, 'DELETE', { token: mallory.token, id: postId })).status,
    ).toBe(404);
    expect(
      (
        await call(commentPATCH as H, 'PATCH', {
          token: mallory.token,
          id: commentId,
          body: { body: 'pwned' },
        })
      ).status,
    ).toBe(404);
    expect((await db.generalPost.findUniqueOrThrow({ where: { id: postId } })).body).toBe(
      'Alice’s original post',
    );
  });

  it('“me” endpoints only ever mean the signed-in person', async () => {
    // No way to name a different user: these take no user ID, and extra fields are refused.
    const del = await call(deletePOST as H, 'POST', {
      token: mallory.token,
      body: { password: 'x', confirm: 'DELETE', userId: alice.id },
    });
    expect(del.status).toBe(400);
    expect((await db.user.findUniqueOrThrow({ where: { id: alice.id } })).status).toBe('ACTIVE');
    await call(reportPOST as H, 'POST', {
      token: alice.token,
      body: { reading: fresh(), target: { type: 'user', username: 'mallory_bp' }, reason: 'SPAM' },
    });
    expect((await call(myReportsGET as H, 'GET', { token: mallory.token })).body.reports).toEqual(
      [],
    );
  });

  it('can’t appeal someone else’s strike', async () => {
    const admin = await createTestUser('admin_bp', { role: 'ADMIN' });
    await issueStrike({ adminId: admin.id, userId: alice.id, reason: 'x' });
    const strike = await db.moderationAction.findFirstOrThrow();
    const r = await call(meAppealsPOST as H, 'POST', {
      token: mallory.token,
      body: { actionId: strike.id, message: 'Please remove her strike, thanks.' },
    });
    expect(r.status).toBe(404);
  });

  it('a malformed or random ID is a plain 404, never a 500', async () => {
    for (const id of ['not-a-uuid', '00000000-0000-7000-8000-000000000000', "1' OR '1'='1"]) {
      const r = await call(postPATCH as H, 'PATCH', {
        token: mallory.token,
        id,
        body: { body: 'x' },
      });
      expect(r.status).toBe(404);
    }
  });
});

describe('spoofed and replayed locations (D7, D16, D38)', () => {
  const feed = (token: string, reading: Record<string, unknown>) =>
    call(feedPOST as H, 'POST', { token, body: { reading } });

  it.each([
    ['outside Duval', { ...fresh(ORANGE_PARK) }, 'LOCATION_OUTSIDE_AREA'],
    ['a mock-location reading', { ...fresh(), mocked: true }, 'LOCATION_MOCKED'],
    [
      'a vague reading (5 km accuracy)',
      { ...fresh(), accuracyMeters: 5000 },
      'LOCATION_INACCURATE',
    ],
    [
      'a replayed 5-minute-old reading',
      { ...DOWNTOWN, accuracyMeters: 10, timestamp: Date.now() - 300_000 },
      'LOCATION_STALE',
    ],
    [
      'a reading from the future',
      { ...DOWNTOWN, accuracyMeters: 10, timestamp: Date.now() + 120_000 },
      'LOCATION_CLOCK_SKEW',
    ],
  ] as const)('refuses %s', async (_l, reading, code) => {
    const r = await feed(mallory.token, reading);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe(code);
  });

  it('refuses a jump that would need a plane faster than any plane', async () => {
    await feed(mallory.token, fresh());
    // Pretend the last good reading was in Atlanta 10 minutes ago.
    await db.locationCheck.updateMany({
      where: { userId: mallory.id },
      data: { receivedAt: new Date(Date.now() - 600_000) },
    });
    await db.$executeRaw`UPDATE "LocationCheck" SET point = ST_SetSRID(ST_MakePoint(${ATLANTA.longitude}, ${ATLANTA.latitude}), 4326)::geography, result = 'ALLOWED' WHERE "userId" = ${mallory.id}::uuid`;
    const r = await feed(mallory.token, fresh());
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('LOCATION_IMPOSSIBLE_TRAVEL');
  });

  it('posting puts the post at the server’s rounded point, not one the client chose', async () => {
    const [row] = await db.$queryRaw<{ lat: number; lon: number }[]>`
      SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lon FROM "GeneralPost" WHERE id = ${postId}::uuid`;
    // ~100 m grid (D7): never the exact reading.
    expect(row!.lat).not.toBe(DOWNTOWN.latitude);
    expect(Math.abs(row!.lat - DOWNTOWN.latitude)).toBeLessThan(0.001);
  });
});

describe('session tricks', () => {
  it('signed-out, revoked and made-up tokens are 401', async () => {
    expect((await call(meGET as H, 'GET')).status).toBe(401);
    expect((await call(meGET as H, 'GET', { token: 'made-up-token-'.repeat(3) })).status).toBe(401);
    await db.session.updateMany({ where: { userId: mallory.id }, data: { revokedAt: new Date() } });
    expect((await call(meGET as H, 'GET', { token: mallory.token })).status).toBe(401);
  });

  it('an expired session is 401', async () => {
    await db.session.updateMany({
      where: { userId: alice.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await call(meGET as H, 'GET', { token: alice.token })).status).toBe(401);
  });
});
