import { beforeEach, describe, expect, it } from 'vitest';
import { REVIEW_POINT } from '@jax/shared';
import { POST as actionPOST } from '@/app/api/v1/admin/users/[id]/actions/route';
import { POST as reviewModePOST } from '@/app/api/v1/admin/review-mode/route';
import { POST as statusPOST } from '@/app/api/v1/location/status/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { pastAccountWait } from '@/server/account-age';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea, isInServiceArea } from '@/server/location/service-area';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D268: App Store / Google Play review accounts are placed at Five Points while review mode is on.

const SAN_FRANCISCO = { latitude: 37.7749, longitude: -122.4194 }; // where a reviewer might be
const reading = (at: { latitude: number; longitude: number }) => ({
  ...at,
  accuracyMeters: 12,
  timestamp: Date.now() - 3_000,
});

let admin: Record<string, string>;
let reviewer: { id: string; token: string };
let local: { id: string; token: string };

async function account(username: string, opts: { verified?: boolean } = {}) {
  const u = await createTestUser(username, {
    emailVerifiedAt: opts.verified === false ? null : new Date(),
  });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}
const status = (token: string, at: { latitude: number; longitude: number }) =>
  call(statusPOST as H, 'POST', { token, body: { reading: reading(at) } });
const setReviewAccount = (id: string, on: boolean, headers = admin) =>
  call(actionPOST as H, 'POST', {
    headers,
    params: { id },
    body: { action: 'reviewAccount', on, reason: 'App Store review' },
  });
const setMode = (on: boolean) =>
  call(reviewModePOST as H, 'POST', { headers: admin, body: { on, reason: 'testing' } });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  invalidateConfigCache();
  await importServiceArea(db, readBoundaryFile());
  admin = await adminHeaders((await createTestUser('boss_rv', { role: 'ADMIN' })).id);
  reviewer = await account('review_google', { verified: false });
  local = await account('local_rv');
}, 60_000);

describe('review mode (D268)', () => {
  it('the review point is inside Duval', async () => {
    expect(await isInServiceArea(db, REVIEW_POINT.latitude, REVIEW_POINT.longitude)).toBe(true);
  });

  it('outside Duval, the refusal offers a review sign-in while review mode is on', async () => {
    const r = await status(local.token, SAN_FRANCISCO);
    expect(r.status).toBe(403);
    expect(r.body.error).toMatchObject({
      code: 'LOCATION_OUTSIDE_AREA',
      details: { reviewSignIn: true },
    });
    await setMode(false);
    const off = await status(local.token, SAN_FRANCISCO);
    expect(off.body.error.code).toBe('LOCATION_OUTSIDE_AREA');
    expect(off.body.error.details).toBeUndefined();
  });

  it('a review account is placed at Five Points wherever the phone is', async () => {
    expect((await status(reviewer.token, SAN_FRANCISCO)).status).toBe(403);

    const r = await setReviewAccount(reviewer.id, true);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const u = await db.user.findUniqueOrThrow({ where: { id: reviewer.id } });
    expect(u.reviewAccount).toBe(true);
    expect(u.emailVerifiedAt).not.toBeNull(); // ready to post at once
    const log = await db.adminAuditLog.findFirstOrThrow({
      where: { action: 'USER_REVIEWACCOUNT' },
    });
    expect(log.metadata).toMatchObject({ on: true, reason: 'App Store review' });

    expect((await status(reviewer.token, SAN_FRANCISCO)).status).toBe(200);
    // Even a mock-location reading far away works: the server never uses it.
    const mocked = await call(statusPOST as H, 'POST', {
      token: reviewer.token,
      body: { reading: { ...reading(SAN_FRANCISCO), mocked: true } },
    });
    expect(mocked.status).toBe(200);

    // A post lands at the review point (rounded like every post), not in San Francisco.
    const post = await call(postsPOST as H, 'POST', {
      token: reviewer.token,
      body: { reading: reading(SAN_FRANCISCO), body: 'Testing the app from Five Points' },
    });
    expect(post.status, JSON.stringify(post.body)).toBe(201);
    const [row] = await db.$queryRaw<{ lat: number; lon: number }[]>`
      SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lon
      FROM "GeneralPost" WHERE "authorId" = ${reviewer.id}::uuid`;
    expect(row!.lat).toBeCloseTo(REVIEW_POINT.latitude, 2);
    expect(row!.lon).toBeCloseTo(REVIEW_POINT.longitude, 2);
    // The audit record has the review point too, never the phone's real spot.
    const [check] = await db.$queryRaw<{ lat: number }[]>`
      SELECT ST_Y(point::geometry) AS lat FROM "LocationCheck"
      WHERE "userId" = ${reviewer.id}::uuid AND result = 'ALLOWED'`;
    expect(check!.lat).toBeCloseTo(REVIEW_POINT.latitude, 3);
  });

  it('review accounts skip the new-account waits', async () => {
    await setReviewAccount(reviewer.id, true);
    const u = await db.user.findUniqueOrThrow({ where: { id: reviewer.id } });
    expect(pastAccountWait(u, 30)).toBe(true);
    const l = await db.user.findUniqueOrThrow({ where: { id: local.id } });
    expect(pastAccountWait(l, 30)).toBe(false);
  });

  it('turning review mode off puts review accounts back on their real location', async () => {
    await setReviewAccount(reviewer.id, true);
    await setMode(false);
    expect((await status(reviewer.token, SAN_FRANCISCO)).status).toBe(403);
    expect(await db.adminAuditLog.count({ where: { action: 'REVIEW_MODE_OFF' } })).toBe(1);
    await setMode(true);
    expect((await status(reviewer.token, SAN_FRANCISCO)).status).toBe(200);
  });

  it('🔒 an ordinary account outside Duval is still refused', async () => {
    expect((await status(local.token, SAN_FRANCISCO)).status).toBe(403);
    const post = await call(postsPOST as H, 'POST', {
      token: local.token,
      body: { reading: reading(SAN_FRANCISCO), body: 'Hello from far away' },
    });
    expect(post.status).toBe(403);
    expect(await db.generalPost.count()).toBe(0);
  });

  it('🔒 only an admin can make a review account; the phone app can’t, and admins can’t be one', async () => {
    // A phone session can't reach the admin route.
    const phone = await call(actionPOST as H, 'POST', {
      token: reviewer.token,
      params: { id: reviewer.id },
      body: { action: 'reviewAccount', on: true, reason: 'me' },
    });
    expect(phone.status).toBe(401);
    expect(
      (
        await call(reviewModePOST as H, 'POST', {
          token: reviewer.token,
          body: { on: true, reason: 'me' },
        })
      ).status,
    ).toBe(401);
    // A reading with extra fields is refused by the strict schema, not trusted.
    const sneaky = await call(statusPOST as H, 'POST', {
      token: reviewer.token,
      body: { reading: reading(SAN_FRANCISCO), reviewAccount: true },
    });
    expect(sneaky.status).toBe(400);
    expect((await db.user.findUniqueOrThrow({ where: { id: reviewer.id } })).reviewAccount).toBe(
      false,
    );
    // An admin account can't be marked.
    const boss = await db.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
    expect((await setReviewAccount(boss.id, true)).status).toBe(409);
  });
});
