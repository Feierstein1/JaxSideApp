import { beforeEach, describe, expect, it } from 'vitest';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { POST as roomPostPOST } from '@/app/api/v1/places/[id]/posts/route';
import { POST as reportPOST } from '@/app/api/v1/reports/route';
import { getCase } from '@/server/admin/queue';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { banUser, liftEnforcement } from '@/server/moderation/enforcement';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D74: 10 different people reporting one account within 7 days suspends it pending review.

const HERE = { latitude: 30.3149, longitude: -81.6853 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });
const DAY = 24 * 60 * 60 * 1000;

let carl: { id: string; token: string }; // the reported account
let adminId: string;
let placeId: string;
let postA: string;
let postB: string;
let roomPost: string;

async function user(name: string, opts: { verified?: boolean; ageDays?: number } = {}) {
  const u = await createTestUser(name, {
    emailVerifiedAt: opts.verified === false ? null : new Date(),
  });
  await db.user.update({
    where: { id: u.id },
    data: { createdAt: new Date(Date.now() - (opts.ageDays ?? 30) * DAY) },
  });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}

const reportAs = (token: string, target: unknown) =>
  call(reportPOST as H, 'POST', { token, body: { reading: reading(), target, reason: 'HATE' } });

/** n qualifying reporters, each reporting one of carl's posts (spread across targets). */
async function reporters(n: number, tag: string, targets: unknown[]) {
  for (let i = 0; i < n; i++) {
    const r = await user(`rep${tag}${i}_s`);
    await reportAs(r.token, targets[i % targets.length]);
  }
}

const status = async () => (await db.user.findUniqueOrThrow({ where: { id: carl.id } })).status;
const postStatus = async (id: string) =>
  (await db.generalPost.findUniqueOrThrow({ where: { id } })).status;
const placeCount = async () =>
  (await db.businessPlace.findUniqueOrThrow({ where: { id: placeId } })).postCount;

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await db.appConfiguration.createMany({
    data: [
      { key: 'rateLimit.post.perMinute', value: 100 },
      // Auto-hide per post is tested in reports.test.ts; keep posts visible here.
      { key: 'moderation.autoHideReports', value: 1000 },
    ],
  });
  invalidateConfigCache();
  await importServiceArea(db, readBoundaryFile());
  await importOsmPlaces(db, [
    { type: 'node', id: 1, lat: 30.315, lon: -81.686, tags: { amenity: 'cafe', name: 'Cafe' } },
  ]);
  placeId = (await db.businessPlace.findFirstOrThrow()).id;
  carl = await user('carl_s');
  adminId = (await user('admin_s')).id;
  const post = async (body: string) =>
    (
      await call(postsPOST as H, 'POST', {
        token: carl.token,
        body: { reading: reading(), body },
      })
    ).body.post.id as string;
  postA = await post('first post from carl');
  postB = await post('second post from carl');
  roomPost = (
    await call(roomPostPOST as H, 'POST', {
      token: carl.token,
      id: placeId,
      body: { reading: reading(), body: 'room post from carl' },
    })
  ).body.post.id;
});

const targets = () => [
  { type: 'general', id: postA },
  { type: 'general', id: postB },
  { type: 'business', id: roomPost },
  { type: 'user', username: 'carl_s' },
];

describe('automatic suspension (D74)', () => {
  it('9 reporters: nothing; the 10th suspends, hides posts and alerts moderators', async () => {
    const before = await placeCount();
    await reporters(9, 'a', targets());
    expect(await status()).toBe('ACTIVE');
    await reporters(1, 'b', targets());
    expect(await status()).toBe('SUSPENDED');
    expect(await postStatus(postA)).toBe('HELD_FOR_REVIEW');
    expect(await postStatus(postB)).toBe('HELD_FOR_REVIEW');
    expect(await placeCount()).toBe(before - 1);
    const auto = await db.autoSuspension.findFirstOrThrow({ where: { userId: carl.id } });
    expect(auto).toMatchObject({ status: 'OPEN', reporterCount: 10 });
    expect(auto.heldGeneralPostIds.sort()).toEqual([postA, postB].sort());
    expect(auto.heldBusinessPostIds).toEqual([roomPost]);
    const notice = await db.report.findFirstOrThrow({
      where: { reportedUserId: carl.id, reporterUserId: null },
    });
    expect(notice.details).toMatch(/^Automatic suspension: 10 different people/);
    // The suspended account can't post.
    const r = await call(postsPOST as H, 'POST', {
      token: carl.token,
      body: { reading: reading(), body: 'still here?' },
    });
    expect(r.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  // 🔒 A pile-on from throwaway accounts doesn't count.
  it('new or unconfirmed reporters and one person reporting many times don’t count', async () => {
    for (let i = 0; i < 5; i++) {
      const fresh = await user(`new${i}_s`, { ageDays: 1 });
      await reportAs(fresh.token, targets()[0]);
      const unverified = await user(`unv${i}_s`, { verified: false });
      await reportAs(unverified.token, targets()[1]);
    }
    const one = await user('loud_s');
    for (const t of targets()) await reportAs(one.token, t);
    await reporters(8, 'c', targets());
    expect(await status()).toBe('ACTIVE'); // 9 qualifying people
  });

  it('reports older than the window don’t count', async () => {
    await reporters(9, 'd', targets());
    await db.report.updateMany({ data: { createdAt: new Date(Date.now() - 8 * DAY) } });
    await reporters(1, 'e', targets());
    expect(await status()).toBe('ACTIVE');
  });

  it('Lift restores the account and exactly the posts it hid', async () => {
    const before = await placeCount();
    // A post a moderator had already removed stays removed.
    await reporters(10, 'f', targets());
    await db.generalPost.update({ where: { id: postB }, data: { status: 'REMOVED' } });
    await liftEnforcement({ adminId, userId: carl.id, reason: 'Reports were not credible' });
    expect(await status()).toBe('ACTIVE');
    expect(await postStatus(postA)).toBe('VISIBLE');
    expect(await postStatus(postB)).toBe('REMOVED');
    expect(await placeCount()).toBe(before);
    expect((await db.autoSuspension.findFirstOrThrow()).status).toBe('RESTORED');
    const notice = await db.report.findFirstOrThrow({ where: { reporterUserId: null } });
    expect(notice.status).toBe('DISMISSED');
  });

  it('Ban confirms it: hidden posts become removed', async () => {
    await reporters(10, 'g', targets());
    await banUser({ adminId, userId: carl.id, reason: 'Hate speech' });
    expect(await status()).toBe('BANNED');
    expect(await postStatus(postA)).toBe('REMOVED');
    expect((await db.autoSuspension.findFirstOrThrow()).status).toBe('CONFIRMED');
  });

  it('the account’s case lists who reported what, summarized, newest 20 unless asked', async () => {
    await reporters(10, 'h', targets());
    for (let i = 0; i < 15; i++) {
      const r = await user(`more${i}_s`);
      await reportAs(r.token, { type: 'user', username: 'carl_s' });
    }
    const c = await getCase({ type: 'user', id: carl.id });
    expect(c.reportTotal).toBe(1 + 2 + 15); // notice + 2 profile reports from the first 10 + 15
    expect(c.reports).toHaveLength(18);
    expect(c.accountReports!.length).toBe(8); // the 8 reports on posts
    expect(c.accountReports![0]).toMatchObject({ reason: 'HATE' });
    expect(c.accountReports![0]!.reporter).toMatch(/^reph\d_s$/);
    expect(c.accountReports![0]!.on.preview).toMatch(/from carl/);
    await db.report.createMany({
      data: Array.from({ length: 5 }, () => ({
        reportedUserId: carl.id,
        reason: 'SPAM' as const,
      })),
    });
    const capped = await getCase({ type: 'user', id: carl.id });
    expect(capped.reports).toHaveLength(20);
    expect(capped.reportsByReason.find((g) => g.reason === 'SPAM')?.count).toBe(5);
    const all = await getCase({ type: 'user', id: carl.id }, { allReports: true });
    expect(all.reports).toHaveLength(capped.reportTotal);
  });
});
