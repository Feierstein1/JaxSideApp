import { beforeEach, describe, expect, it } from 'vitest';
import { POST as restrictedAppealPOST } from '@/app/api/v1/appeals/restricted/route';
import { POST as restrictedStandingPOST } from '@/app/api/v1/appeals/restricted/standing/route';
import { POST as loginPOST } from '@/app/api/v1/auth/login/route';
import { POST as meAppealsPOST } from '@/app/api/v1/me/appeals/route';
import { GET as standingGET } from '@/app/api/v1/me/standing/route';
import { hashPassword } from '@/server/auth/crypto';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { decideAppeal } from '@/server/moderation/appeals';
import { banUser, issueStrike } from '@/server/moderation/enforcement';
import { findForbiddenKeys } from '@/server/serializers';
import { resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

const PW = 'correct horse battery';
const DAY = 86_400_000;
const MSG = 'It was a quote from the news, not my words.';

let adminId: string;
let userId: string;
let token: string;

const creds = (password = PW) => ({ identifier: 'appellant_a', password });
const restrictedStanding = (password = PW) =>
  call(restrictedStandingPOST as H, 'POST', { body: creds(password) });
const restrictedAppeal = (actionId: string, password = PW, message = MSG) =>
  call(restrictedAppealPOST as H, 'POST', { body: { ...creds(password), actionId, message } });
const myAppeal = (actionId: string, message = MSG) =>
  call(meAppealsPOST as H, 'POST', { token, body: { actionId, message } });

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  adminId = (await createTestUser('admin_a', { role: 'ADMIN' })).id;
  userId = (
    await createTestUser('appellant_a', {
      emailVerifiedAt: new Date(),
      passwordHash: await hashPassword(PW),
    })
  ).id;
  token = (await createSession(userId, 'MOBILE')).token;
});

describe('appealing while signed in (P5.7)', () => {
  it('a warning can be appealed once; accepting it cancels the strike', async () => {
    await issueStrike({ adminId, userId, reason: 'Harassment' });
    let s = (await call(standingGET as H, 'GET', { token })).body;
    expect(s.strikes[0]).toMatchObject({ action: 'WARN', canAppeal: true, appeal: null });

    expect((await myAppeal(s.strikes[0].id)).status).toBe(201);
    const again = await myAppeal(s.strikes[0].id);
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe('Your appeal is waiting for review.');

    const appeal = await db.appeal.findFirstOrThrow();
    await decideAppeal({ adminId, appealId: appeal.id, accept: true, note: 'Agreed, context.' });
    s = (await call(standingGET as H, 'GET', { token })).body;
    expect(s.strikes).toHaveLength(0); // voided strikes don't show or count
  });

  it('a rejected appeal is final for warnings, with the note shown', async () => {
    await issueStrike({ adminId, userId, reason: 'Spam' });
    const strikeId = (await db.moderationAction.findFirstOrThrow()).id;
    await myAppeal(strikeId);
    await decideAppeal({
      adminId,
      appealId: (await db.appeal.findFirstOrThrow()).id,
      accept: false,
      note: 'Links were ads.',
    });
    const s = (await call(standingGET as H, 'GET', { token })).body;
    expect(s.strikes[0]).toMatchObject({
      canAppeal: false,
      appeal: { status: 'REJECTED', decisionNote: 'Links were ads.' },
    });
    expect((await myAppeal(strikeId)).status).toBe(409);
    expect(findForbiddenKeys(s)).toEqual([]);
    expect(JSON.stringify(s)).not.toMatch(/admin_a|decidedById|internalNote/);
  });

  it('warnings older than 30 days can’t be appealed', async () => {
    await issueStrike({ adminId, userId, reason: 'x', now: new Date(Date.now() - 31 * DAY) });
    const id = (await db.moderationAction.findFirstOrThrow()).id;
    const r = await myAppeal(id);
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/within 30 days/);
  });

  // 🔒 no appealing someone else's strike, and no smuggled fields.
  it('only your own strikes, and strict input', async () => {
    const other = await createTestUser('other_a');
    await issueStrike({ adminId, userId: other.id, reason: 'x' });
    const theirs = (await db.moderationAction.findFirstOrThrow()).id;
    expect((await myAppeal(theirs)).status).toBe(404);
    const smuggled = await call(meAppealsPOST as H, 'POST', {
      token,
      body: { actionId: theirs, message: MSG, userId: other.id },
    });
    expect(smuggled.status).toBe(400);
    expect((await myAppeal(theirs, 'short')).status).toBe(400);
    expect(await db.appeal.count()).toBe(0);
  });

  it('only one decision, even with two moderators', async () => {
    await issueStrike({ adminId, userId, reason: 'x' });
    await myAppeal((await db.moderationAction.findFirstOrThrow()).id);
    const appealId = (await db.appeal.findFirstOrThrow()).id;
    await decideAppeal({ adminId, appealId, accept: false, note: 'no' });
    await expect(
      decideAppeal({ adminId, appealId, accept: true, note: 'yes' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await db.moderationAction.count({ where: { voidedAt: { not: null } } })).toBe(0);
  });
});

describe('banned or suspended: appealing with a password (P5.7, D59)', () => {
  it('a banned person sees why and can appeal; accepting lifts the ban', async () => {
    await banUser({ adminId, userId, reason: 'Threats in comments' });
    const login = await call(loginPOST as H, 'POST', { body: creds() });
    expect(login.body.error.code).toBe('ACCOUNT_BANNED');

    const s = await restrictedStanding();
    expect(s.status).toBe(200);
    expect(s.body).toMatchObject({
      status: 'BANNED',
      strikes: [{ action: 'BAN', reason: 'Threats in comments', canAppeal: true }],
    });
    expect((await restrictedAppeal(s.body.strikes[0].id)).status).toBe(201);

    await decideAppeal({
      adminId,
      appealId: (await db.appeal.findFirstOrThrow()).id,
      accept: true,
      note: 'Misread',
    });
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).status).toBe('ACTIVE');
    expect((await call(loginPOST as H, 'POST', { body: creds() })).status).toBe(200);
  });

  it('after a rejected ban appeal, the next one waits 90 days', async () => {
    await banUser({ adminId, userId, reason: 'x' });
    const banId = (await db.moderationAction.findFirstOrThrow()).id;
    await restrictedAppeal(banId);
    const appealId = (await db.appeal.findFirstOrThrow()).id;
    await decideAppeal({ adminId, appealId, accept: false, note: 'Upheld' });
    const r = await restrictedAppeal(banId);
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/appeal again after/);
    await db.appeal.update({
      where: { id: appealId },
      data: { decidedAt: new Date(Date.now() - 91 * DAY) },
    });
    expect((await restrictedAppeal(banId)).status).toBe(201);
  });

  // 🔒 the password route grants nothing to people who aren't restricted, and fails like login.
  it('wrong password is refused like login, and counts toward the login limit', async () => {
    await banUser({ adminId, userId, reason: 'x' });
    const bad = await restrictedStanding('wrong password here');
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(await db.rateLimitCounter.count({ where: { key: { startsWith: 'login-fail:' } } })).toBe(
      2,
    );
  });

  it('an account in good standing is told to sign in instead', async () => {
    const r = await restrictedStanding();
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('NOT_RESTRICTED');
  });

  it('a suspended person can use it too', async () => {
    await issueStrike({ adminId, userId, reason: 'a' });
    await issueStrike({ adminId, userId, reason: 'b' }); // 24 h suspension
    const s = await restrictedStanding();
    expect(s.body.status).toBe('SUSPENDED');
    expect(s.body.strikes.map((x: { action: string }) => x.action)).toEqual(['WARN', 'SUSPEND']);
  });
});
