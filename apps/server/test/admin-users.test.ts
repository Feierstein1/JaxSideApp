import { beforeEach, describe, expect, it } from 'vitest';
import { GET as usersGET } from '@/app/api/v1/admin/users/route';
import { GET as userGET } from '@/app/api/v1/admin/users/[id]/route';
import { POST as actionPOST } from '@/app/api/v1/admin/users/[id]/actions/route';
import { GET as standingGET } from '@/app/api/v1/me/standing/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { signupCounts } from '@/server/admin/users';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// The Users page: any-part search, strikes / banned / suspended lists, 20 per page,
// sign-up counts, and a person's page with their photo and the reports about them.
const HERE = { latitude: 30.3149, longitude: -81.6853 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let admin: Record<string, string>;
let adminId: string;

const list = (query: Record<string, string> = {}) =>
  call(usersGET as H, 'GET', { headers: admin, query });
const names = (r: { body: { users: { username: string }[] } }) =>
  r.body.users.map((u) => u.username);
const act = (id: string, body: Record<string, unknown>) =>
  call(actionPOST as H, 'POST', { headers: admin, params: { id }, body });
const strikeRow = (userId: string, createdAt = new Date(), voidedAt: Date | null = null) =>
  db.moderationAction.create({
    data: { adminId, targetUserId: userId, action: 'WARN', reason: 'Spam', createdAt, voidedAt },
  });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  invalidateConfigCache();
  adminId = (await createTestUser('us_admin', { role: 'ADMIN' })).id;
  admin = await adminHeaders(adminId);
});

describe('finding people', () => {
  it('matches any part of the username, with _ taken literally', async () => {
    await createTestUser('river_cat');
    await createTestUser('riverxcat');
    await createTestUser('Catfish');
    expect(names(await list({ q: 'CAT', filter: 'all' }))).toEqual([
      'Catfish',
      'river_cat',
      'riverxcat',
    ]);
    expect(names(await list({ q: '@r_c', filter: 'all' }))).toEqual(['river_cat']);
    expect(names(await list({ q: '%', filter: 'all' }))).toEqual([]);
  });

  it('lists people with strikes by default (newest strike first), not cancelled ones', async () => {
    const a = await createTestUser('has_old');
    const b = await createTestUser('has_new');
    const c = await createTestUser('was_voided');
    await createTestUser('clean');
    await strikeRow(a.id, new Date(Date.now() - 400 * 86_400_000)); // past the decay window
    await strikeRow(b.id);
    await strikeRow(b.id);
    await strikeRow(c.id, new Date(), new Date());
    const r = await list();
    expect(names(r)).toEqual(['has_new', 'has_old']);
    expect(r.body.users[0]).toMatchObject({ strikes: 2, countingStrikes: 2 });
    expect(r.body.users[1]).toMatchObject({ strikes: 1, countingStrikes: 0 });
    expect(names(await list({ q: 'old' }))).toEqual(['has_old']);
  });

  it('filters banned and suspended accounts; unknown filters fall back to strikes', async () => {
    await createTestUser('gone_for_good', { status: 'BANNED' });
    await createTestUser('time_out', {
      status: 'SUSPENDED',
      suspendedUntil: new Date(Date.now() + 86_400_000),
    });
    await createTestUser('fine');
    expect(names(await list({ filter: 'banned' }))).toEqual(['gone_for_good']);
    expect(names(await list({ filter: 'suspended' }))).toEqual(['time_out']);
    expect(names(await list({ filter: 'banned', q: 'time' }))).toEqual([]);
    expect(names(await list({ filter: 'nonsense' }))).toEqual([]);
  });

  it('pages 20 at a time', async () => {
    for (let i = 0; i < 45; i++) {
      const u = await createTestUser(`pg_${String(i).padStart(2, '0')}`);
      await strikeRow(u.id, new Date(Date.now() - i * 60_000));
    }
    const p1 = await list();
    expect(p1.body).toMatchObject({ page: 1, pageSize: 20, total: 45, pages: 3 });
    expect(p1.body.users).toHaveLength(20);
    expect(p1.body.users[0].username).toBe('pg_00');
    const p3 = await list({ page: '3' });
    expect(names(p3)).toEqual(['pg_40', 'pg_41', 'pg_42', 'pg_43', 'pg_44']);
    const all = await list({ filter: 'all', q: 'pg_', page: '2' });
    expect(all.body).toMatchObject({ page: 2, total: 45 });
    expect(all.body.users[0].username).toBe('pg_20');
    expect((await list({ page: '-4' })).body.page).toBe(1);
  });

  it('is for admins only', async () => {
    const u = await createTestUser('nosy');
    const token = (await createSession(u.id, 'MOBILE')).token;
    expect((await call(usersGET as H, 'GET', { token })).status).toBe(401);
    expect((await call(usersGET as H, 'GET')).status).toBe(401);
  });
});

describe('sign-up counts', () => {
  it('counts today, this week (Monday on) and this month in Jacksonville time', async () => {
    // Wednesday 2030-11-06, 01:30 in Jacksonville (06:30 UTC).
    const now = new Date('2030-11-06T06:30:00Z');
    const at = (iso: string) =>
      createTestUser(`u${Math.random().toString(36).slice(2, 10)}`, { createdAt: new Date(iso) });
    await at('2030-11-06T05:10:00Z'); // 00:10 today, local
    await at('2030-11-06T04:50:00Z'); // 23:50 yesterday, local (already the 6th in UTC)
    await at('2030-11-04T06:00:00Z'); // Monday 01:00 local
    await at('2030-11-03T12:00:00Z'); // Sunday: this month, last week
    await at('2030-10-31T12:00:00Z'); // last month
    await at('2030-11-07T12:00:00Z'); // after "now": not counted
    // + the admin account from beforeEach (created today, years before `now`): total only.
    expect(await signupCounts(now)).toEqual({ today: 1, week: 3, month: 4, total: 6 });
  });
});

describe("a person's page", () => {
  beforeEach(async () => {
    await importServiceArea(db, readBoundaryFile());
  });

  async function setup() {
    const target = await createTestUser('target_t', { emailVerifiedAt: new Date() });
    const reporter = await createTestUser('reporter_r');
    const other = await createTestUser('other_o', { emailVerifiedAt: new Date() });
    const token = (await createSession(target.id, 'MOBILE')).token;
    const photo = await db.photo.create({ data: { uploaderId: target.id, status: 'ACTIVE' } });
    await db.profile.create({ data: { userId: target.id, avatarPhotoId: photo.id, bio: 'Hi' } });
    const post = await call(postsPOST as H, 'POST', {
      token,
      body: { reading: reading(), body: 'something people did not like' },
    });
    const postId = post.body.post.id as string;
    const onPost = await db.report.create({
      data: { reporterUserId: reporter.id, generalPostId: postId, reason: 'SPAM' },
    });
    const onProfile = await db.report.create({
      data: { reporterUserId: reporter.id, reportedUserId: target.id, reason: 'HARASSMENT' },
    });
    const elsewhere = await db.report.create({
      data: { reporterUserId: reporter.id, reportedUserId: other.id, reason: 'SCAM' },
    });
    return { target, other, token, photo, postId, onPost, onProfile, elsewhere };
  }

  it('shows their photo and the reports about them, never their email', async () => {
    const s = await setup();
    const r = await call(userGET as H, 'GET', { headers: admin, params: { id: s.target.id } });
    expect(r.status).toBe(200);
    expect(r.body.avatarUrl).toBe(`/api/v1/admin/photos/${s.photo.id}`);
    expect(r.body.reports.map((x: { id: string }) => x.id).sort()).toEqual(
      [s.onPost.id, s.onProfile.id].sort(),
    );
    const post = r.body.reports.find((x: { id: string }) => x.id === s.onPost.id);
    expect(post).toMatchObject({
      reason: 'SPAM',
      reporter: '@reporter_r',
      what: 'general',
      caseHref: `/admin/cases/general/${s.postId}`,
      strike: null,
    });
    expect(r.body.nextStrike).toMatchObject({ action: 'WARN', strike: 1 });
    expect(r.body.history.reportsAgainst).toBe(2);
    expect(r.raw).not.toMatch(/email(Enc|Index)|passwordHash|@example\.test/);
  });

  it('Notify gives a warning tied to the report, shown to them, once per report', async () => {
    const s = await setup();
    const message = 'You were reported for spam (your post).';
    expect(
      (await act(s.target.id, { action: 'strike', reason: message, reportId: s.onPost.id })).status,
    ).toBe(200);
    const strike = await db.moderationAction.findFirstOrThrow({
      where: { targetUserId: s.target.id },
    });
    expect(strike).toMatchObject({ action: 'WARN', reportId: s.onPost.id, reason: message });
    const standing = await call(standingGET as H, 'GET', { token: s.token });
    expect(standing.body.strikes).toMatchObject([{ action: 'WARN', reason: message }]);

    const again = await act(s.target.id, {
      action: 'strike',
      reason: 'x y z',
      reportId: s.onPost.id,
    });
    expect(again.status).toBe(409);
    const rec = await call(userGET as H, 'GET', { headers: admin, params: { id: s.target.id } });
    const row = rec.body.reports.find((x: { id: string }) => x.id === s.onPost.id);
    expect(row.strike).toMatchObject({ action: 'WARN' });
    expect(rec.body.nextStrike).toMatchObject({ action: 'SUSPEND', strike: 2, hours: 24 });
  });

  it('🔒 refuses a report about someone else, or one that does not exist', async () => {
    const s = await setup();
    const wrong = await act(s.target.id, {
      action: 'strike',
      reason: 'Reported for a scam',
      reportId: s.elsewhere.id,
    });
    expect(wrong.status).toBe(404);
    const missing = await act(s.target.id, {
      action: 'strike',
      reason: 'Reported for a scam',
      reportId: '00000000-0000-7000-8000-000000000000',
    });
    expect(missing.status).toBe(404);
    expect(await db.moderationAction.count()).toBe(0);
    const extra = await act(s.target.id, { action: 'ban', reason: 'x y z', reportId: s.onPost.id });
    expect(extra.status).toBe(400); // only a strike takes a report
  });
});
