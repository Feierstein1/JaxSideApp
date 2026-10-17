import { beforeEach, describe, expect, it } from 'vitest';
import { POST as guestsPOST } from '@/app/api/v1/guests/route';
import { POST as installPOST } from '@/app/api/v1/installations/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { POST as roomPostPOST } from '@/app/api/v1/places/[id]/posts/route';
import { POST as commentPOST } from '@/app/api/v1/posts/[id]/comments/route';
import { POST as reportPOST } from '@/app/api/v1/reports/route';
import { GET as myReportsGET } from '@/app/api/v1/me/reports/route';
import { PUT as blockPUT } from '@/app/api/v1/users/[username]/block/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { INSTALLATION_HEADER } from '@/server/installations';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { findForbiddenKeys } from '@/server/serializers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

const HERE = { latitude: 30.3149, longitude: -81.6853 };
const OUTSIDE = { latitude: 30.1661, longitude: -81.7065 };
const reading = (p = HERE) => ({ ...p, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let alice: string; // author
let bob: string; // reporter
let postId: string;
let commentId: string;
let roomPostId: string;

async function userToken(username: string) {
  const u = await createTestUser(username, { emailVerifiedAt: new Date() });
  return (await createSession(u.id, 'MOBILE')).token;
}
async function guestToken() {
  const inst = (await call(installPOST as H, 'POST', { body: {} })).body.installationToken;
  const r = await call(guestsPOST as H, 'POST', {
    body: {},
    headers: { [INSTALLATION_HEADER]: inst },
  });
  return r.body.token as string;
}
async function relaxReportLimit() {
  await db.appConfiguration.create({ data: { key: 'rateLimit.report.perMinute', value: 20 } });
  invalidateConfigCache();
}
const report = (token: string, target: unknown, extra: Record<string, unknown> = {}) =>
  call(reportPOST as H, 'POST', {
    token,
    body: { reading: reading(), target, reason: 'SPAM', ...extra },
  });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  invalidateConfigCache();
  await importServiceArea(db, readBoundaryFile());
  await importOsmPlaces(db, [
    { type: 'node', id: 1, lat: 30.315, lon: -81.686, tags: { amenity: 'cafe', name: 'Cafe' } },
  ]);
  const placeId = (await db.businessPlace.findFirstOrThrow()).id;
  alice = await userToken('alice_r');
  bob = await userToken('bob_r');
  postId = (
    await call(postsPOST as H, 'POST', {
      token: alice,
      body: { reading: reading(), body: 'buy cheap stuff' },
    })
  ).body.post.id;
  commentId = (
    await call(commentPOST as H, 'POST', {
      token: alice,
      id: postId,
      body: { reading: reading(), body: 'a comment' },
    })
  ).body.id;
  roomPostId = (
    await call(roomPostPOST as H, 'POST', {
      token: alice,
      id: placeId,
      body: { reading: reading(), body: 'room post' },
    })
  ).body.post.id;
});

describe('reporting (P5.1, ✅MS1)', () => {
  it('reports a post, a comment, a room post and a profile', async () => {
    await relaxReportLimit();
    for (const target of [
      { type: 'general', id: postId },
      { type: 'comment', id: commentId },
      { type: 'business', id: roomPostId },
      { type: 'user', username: 'alice_r' },
    ]) {
      const r = await report(bob, target, { reason: 'HARASSMENT', details: '  rude  ' });
      expect(r.status).toBe(202);
      expect(r.body).toEqual({ status: 'received' });
    }
    const rows = await db.report.findMany();
    const aliceId = (await db.user.findFirstOrThrow({ where: { username: 'alice_r' } })).id;
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.status === 'OPEN' && r.reporterUserId)).toBe(true);
    expect(rows.filter((r) => r.reportedUserId === aliceId)).toHaveLength(1);
    expect(rows.every((r) => r.details === 'rude')).toBe(true);
  });

  it('dedupes repeats from the same person while open, with the same response', async () => {
    await relaxReportLimit();
    const a = await report(bob, { type: 'general', id: postId });
    const b = await report(bob, { type: 'general', id: postId }, { reason: 'SCAM' });
    expect(b.status).toBe(a.status);
    expect(b.raw).toBe(a.raw);
    expect(await db.report.count()).toBe(1);
    // A profile report is separate from reports on that person's posts.
    await report(bob, { type: 'user', username: 'alice_r' });
    expect(await db.report.count()).toBe(2);
    // Once resolved, a new report is a new case.
    await db.report.updateMany({ data: { status: 'DISMISSED', resolvedAt: new Date() } });
    await report(bob, { type: 'general', id: postId });
    expect(await db.report.count()).toBe(3);
  });

  it('two simultaneous identical reports create one row', async () => {
    await Promise.all([
      report(bob, { type: 'comment', id: commentId }),
      report(bob, { type: 'comment', id: commentId }),
    ]);
    expect(await db.report.count()).toBe(1);
  });

  // 🔒 negative cases
  it('refuses your own content, unknown or hidden items, and bad input', async () => {
    expect((await report(alice, { type: 'general', id: postId })).body.error.code).toBe(
      'CANNOT_REPORT_OWN',
    );
    expect((await report(alice, { type: 'user', username: 'alice_r' })).status).toBe(400);
    expect(
      (await report(bob, { type: 'general', id: '00000000-0000-7000-8000-000000000000' })).status,
    ).toBe(404);
    await db.generalPost.update({ where: { id: postId }, data: { status: 'REMOVED' } });
    expect((await report(bob, { type: 'general', id: postId })).status).toBe(404);
    expect((await report(bob, { type: 'user', username: 'nobody_here' })).status).toBe(404);
    expect((await report(bob, { type: 'comment', id: commentId }, { reason: 'NOPE' })).status).toBe(
      400,
    );
    expect(
      (await report(bob, { type: 'comment', id: commentId }, { reporterUserId: 'x' })).status,
    ).toBe(400);
    expect(
      (await report(bob, { type: 'comment', id: commentId }, { details: 'x'.repeat(1001) })).status,
    ).toBe(400);
    expect((await call(reportPOST as H, 'POST', { body: {} })).status).toBe(401);
    expect(await db.report.count()).toBe(0);
  });

  it('a profile that blocked you is not reportable by name (404), like viewing it', async () => {
    await call(blockPUT as H, 'PUT', { token: alice, params: { username: 'bob_r' } });
    expect((await report(bob, { type: 'user', username: 'alice_r' })).status).toBe(404);
  });

  it('needs an in-Duval location', async () => {
    const r = await call(reportPOST as H, 'POST', {
      token: bob,
      body: { reading: reading(OUTSIDE), target: { type: 'general', id: postId }, reason: 'SPAM' },
    });
    expect(r.status).toBe(403);
    expect(await db.report.count()).toBe(0);
  });

  it('is rate-limited per minute (4th is 429)', async () => {
    const targets = [
      { type: 'general', id: postId },
      { type: 'comment', id: commentId },
      { type: 'business', id: roomPostId },
      { type: 'user', username: 'alice_r' },
    ];
    const codes = [];
    for (const t of targets) codes.push((await report(bob, t)).status);
    expect(codes).toEqual([202, 202, 202, 429]);
  });
});

describe('guests (D54: view-only)', () => {
  it('guests cannot report or list reports', async () => {
    const g = await guestToken();
    for (const t of [
      { type: 'general', id: postId },
      { type: 'user', username: 'alice_r' },
    ]) {
      const r = await report(g, t);
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('GUEST_NOT_ALLOWED');
    }
    expect((await call(myReportsGET as H, 'GET', { token: g })).status).toBe(403);
    expect(await db.report.count()).toBe(0);
  });
});

describe('my reports (P4.11)', () => {
  it('lists your own reports with status and a short preview, nothing private', async () => {
    await report(bob, { type: 'general', id: postId });
    await report(bob, { type: 'user', username: 'alice_r' });
    await report(alice, { type: 'user', username: 'bob_r' }); // someone else's report
    await db.report.updateMany({
      where: { generalPostId: postId },
      data: { status: 'ACTIONED', resolvedAt: new Date() },
    });
    const r = await call(myReportsGET as H, 'GET', { token: bob });
    expect(r.status).toBe(200);
    expect(r.body.reports).toHaveLength(2);
    const byType = Object.fromEntries(
      r.body.reports.map((x: { targetType: string }) => [x.targetType, x]),
    );
    expect(byType.general).toMatchObject({ status: 'ACTIONED', preview: 'buy cheap stuff' });
    expect(byType.user).toMatchObject({ status: 'OPEN', preview: 'alice_r' });
    expect(findForbiddenKeys(r.body)).toEqual([]);
    expect(r.raw).not.toMatch(/reporterUserId|reportedUserId|resolvedById|details/);
  });

  it('a removed post shows as no longer visible', async () => {
    await report(bob, { type: 'general', id: postId });
    await db.generalPost.update({ where: { id: postId }, data: { status: 'REMOVED' } });
    const r = await call(myReportsGET as H, 'GET', { token: bob });
    expect(r.body.reports[0].preview).toBe('[no longer visible]');
  });
});

// D73: a post reported by 3 different people is hidden until a moderator decides.
describe('auto-hide after reports (D73)', () => {
  const reporters = (n: number, tag = 'a') =>
    Promise.all(Array.from({ length: n }, (_, i) => userToken(`rep_${tag}${i}_r`)));
  const status = async () =>
    (await db.generalPost.findUniqueOrThrow({ where: { id: postId } })).status;

  it('stays visible at 2 reporters and is held at the 3rd', async () => {
    const [r1, r2, r3] = await reporters(3);
    await report(r1!, { type: 'general', id: postId });
    await report(r1!, { type: 'general', id: postId }); // a repeat doesn't count twice
    await report(r2!, { type: 'general', id: postId });
    expect(await status()).toBe('VISIBLE');
    expect((await report(r3!, { type: 'general', id: postId })).status).toBe(202);
    expect(await status()).toBe('HELD_FOR_REVIEW');
    // Hidden from everyone: nobody can report it again (404, like a removed post).
    expect((await report(bob, { type: 'general', id: postId })).status).toBe(404);
  });

  it('three simultaneous reports still hide it', async () => {
    const rs = await reporters(3);
    await Promise.all(rs.map((r) => report(r, { type: 'general', id: postId })));
    expect(await status()).toBe('HELD_FOR_REVIEW');
  });

  it('a room post is held and leaves the place’s post count', async () => {
    const before = (await db.businessPlace.findFirstOrThrow()).postCount;
    for (const r of await reporters(3)) await report(r, { type: 'business', id: roomPostId });
    const p = await db.businessPost.findUniqueOrThrow({ where: { id: roomPostId } });
    expect(p.status).toBe('HELD_FOR_REVIEW');
    expect((await db.businessPlace.findFirstOrThrow()).postCount).toBe(before - 1);
  });

  it('comments are not auto-hidden; the threshold is a setting', async () => {
    for (const r of await reporters(3)) await report(r, { type: 'comment', id: commentId });
    expect((await db.comment.findUniqueOrThrow({ where: { id: commentId } })).status).toBe(
      'VISIBLE',
    );
    await db.appConfiguration.create({ data: { key: 'moderation.autoHideReports', value: 5 } });
    invalidateConfigCache();
    for (const r of await reporters(4, 'b')) await report(r, { type: 'general', id: postId });
    expect(await status()).toBe('VISIBLE');
  });
});
