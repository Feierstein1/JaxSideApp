import { beforeEach, describe, expect, it } from 'vitest';
import { POST as registerPOST } from '@/app/api/v1/auth/register/route';
import { POST as loginPOST } from '@/app/api/v1/auth/login/route';
import { GET as meGET } from '@/app/api/v1/me/route';
import { PATCH as usernamePATCH } from '@/app/api/v1/me/username/route';
import { POST as passwordPOST } from '@/app/api/v1/me/password/route';
import { POST as emailPOST } from '@/app/api/v1/me/email/route';
import { POST as emailConfirmPOST } from '@/app/api/v1/me/email/confirm/route';
import { POST as deletePOST } from '@/app/api/v1/me/delete/route';
import { POST as profilePOST } from '@/app/api/v1/users/[username]/route';
import { PUT as blockPUT, DELETE as blockDELETE } from '@/app/api/v1/users/[username]/block/route';
import { GET as blocksGET } from '@/app/api/v1/me/blocks/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { POST as feedPOST } from '@/app/api/v1/feed/route';
import { PUT as favPUT } from '@/app/api/v1/places/[id]/favorite/route';
import { invalidateConfigCache } from '@/server/config';
import { decryptUserEmail } from '@/server/crypto/field-encryption';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { runMaintenance } from '@/server/jobs/maintenance';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { setMailer } from '@/server/mail/mailer';
import { findForbiddenKeys } from '@/server/serializers';
import { resetDb } from './db-helpers';
import { captureMailer, codeFromMail } from './http-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';

const PW = 'correct horse battery';
const HERE = { latitude: 30.3149, longitude: -81.6853 };
const reading = (p = HERE) => ({ ...p, accuracyMeters: 10, timestamp: Date.now() - 2_000 });
const DAY = 86_400_000;
let mail: ReturnType<typeof captureMailer>;

async function signUp(username: string, email: string) {
  await call(registerPOST as H, 'POST', {
    body: { username, email, password: PW, birthYear: 1990, acceptTerms: true, confirmAdult: true },
  });
  await db.user.updateMany({
    where: { usernameNormalized: username.toLowerCase() },
    data: { emailVerifiedAt: new Date() },
  });
  return login(username);
}
async function login(identifier: string, password = PW) {
  const r = await call(loginPOST as H, 'POST', { body: { identifier, password } });
  return r.body?.token as string;
}

let ann: string;
let ben: string;

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  mail = captureMailer();
  setMailer(mail.mailer);
  await importServiceArea(db, readBoundaryFile());
  ann = await signUp('ann_a', 'ann@example.test');
  ben = await signUp('ben_b', 'ben@example.test');
});

describe('username change (P4.9, ✅A1)', () => {
  const change = (token: string, username: string) =>
    call(usernamePATCH as H, 'PATCH', { token, body: { username } });

  it('changes the name but keeps the same account, sessions and history', async () => {
    const before = await db.user.findFirstOrThrow({ where: { usernameNormalized: 'ann_a' } });
    await call(postsPOST as H, 'POST', {
      token: ann,
      body: { reading: reading(), body: 'my post' },
    });
    const r = await change(ann, 'AnnRiver');
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ id: before.id, username: 'AnnRiver' });
    expect((await call(meGET as H, 'GET', { token: ann })).body.user.username).toBe('AnnRiver');
    const feed = await call(feedPOST as H, 'POST', { token: ben, body: { reading: reading() } });
    expect(feed.body.posts[0].author).toMatchObject({ username: 'AnnRiver', medals: [] });
    const history = await db.usernameHistory.findMany({ where: { userId: before.id } });
    expect(history.map((h) => h.username)).toEqual(['ann_a']);
  });

  it('enforces the 30-day cooldown, but allows a capitalization-only change', async () => {
    await change(ann, 'AnnRiver');
    const again = await change(ann, 'AnnOcean');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('USERNAME_COOLDOWN');
    expect((await change(ann, 'annriver')).status).toBe(200);
  });

  // 🔒 Impersonation guard: a released name is held for 30 days.
  it('a released username stays reserved for 30 days', async () => {
    await change(ann, 'AnnRiver');
    expect((await change(ben, 'ann_a')).body.error.code).toBe('USERNAME_TAKEN');
    await db.usernameHistory.updateMany({ data: { changedAt: new Date(Date.now() - 31 * DAY) } });
    expect((await change(ben, 'ann_a')).status).toBe(200);
  });

  it('rejects taken, reserved and malformed names, and extra fields', async () => {
    expect((await change(ann, 'BEN_B')).body.error.code).toBe('USERNAME_TAKEN');
    expect((await change(ann, 'admin')).status).toBe(400);
    expect((await change(ann, 'a b')).status).toBe(400);
    expect(
      (
        await call(usernamePATCH as H, 'PATCH', {
          token: ann,
          body: { username: 'ok_name', role: 'ADMIN' },
        })
      ).status,
    ).toBe(400);
  });
});

describe('password change (P4.10)', () => {
  it('needs the current password and signs out other devices only', async () => {
    const otherDevice = await login('ann_a');
    const wrong = await call(passwordPOST as H, 'POST', {
      token: ann,
      body: { currentPassword: 'nope', newPassword: 'a whole new password' },
    });
    expect(wrong.body.error.code).toBe('WRONG_PASSWORD');
    const r = await call(passwordPOST as H, 'POST', {
      token: ann,
      body: { currentPassword: PW, newPassword: 'a whole new password' },
    });
    expect(r.status).toBe(200);
    expect((await call(meGET as H, 'GET', { token: ann })).status).toBe(200);
    expect((await call(meGET as H, 'GET', { token: otherDevice })).status).toBe(401);
    expect(await login('ann_a')).toBeUndefined();
    expect(await login('ann_a', 'a whole new password')).toBeTruthy();
  });

  // 🔒 Guessing the current password is rate-limited (5 per 15 min).
  it('limits wrong current-password guesses', async () => {
    for (let i = 0; i < 5; i++) {
      await call(passwordPOST as H, 'POST', {
        token: ann,
        body: { currentPassword: `x${i}`, newPassword: 'a whole new password' },
      });
    }
    const r = await call(passwordPOST as H, 'POST', {
      token: ann,
      body: { currentPassword: PW, newPassword: 'a whole new password' },
    });
    expect(r.status).toBe(429);
  });
});

describe('email change (P4.10)', () => {
  it('sends a code to the new address, notifies the old one, and switches after the code', async () => {
    mail.sent.length = 0;
    const r = await call(emailPOST as H, 'POST', {
      token: ann,
      body: { newEmail: 'ann.new@example.test', password: PW },
    });
    expect(r.status).toBe(202);
    const toNew = mail.sent.find((m) => m.to === 'ann.new@example.test')!;
    expect(mail.sent.find((m) => m.to === 'ann@example.test')?.subject).toMatch(/requested/);

    const c = await call(emailConfirmPOST as H, 'POST', {
      token: ann,
      body: { code: codeFromMail(toNew) },
    });
    expect(c.status).toBe(200);
    const u = await db.user.findFirstOrThrow({ where: { usernameNormalized: 'ann_a' } });
    expect(decryptUserEmail(u)).toBe('ann.new@example.test');
    expect(await login('ann.new@example.test')).toBeTruthy();
    expect(await login('ann@example.test')).toBeUndefined();
    expect(mail.sent.filter((m) => m.to === 'ann@example.test').at(-1)?.subject).toMatch(
      /was changed/,
    );
  });

  // 🔒 No disclosure: an address that belongs to someone else gets the same answer.
  it("an address that's already taken gets the same response and no code", async () => {
    mail.sent.length = 0;
    const r = await call(emailPOST as H, 'POST', {
      token: ann,
      body: { newEmail: 'ben@example.test', password: PW },
    });
    expect(r.status).toBe(202);
    const toBen = mail.sent.filter((m) => m.to === 'ben@example.test');
    expect(toBen).toHaveLength(1);
    expect(toBen[0]!.subject).toMatch(/tried/);
    expect(toBen[0]!.text).not.toMatch(/\d{3} \d{3}/);
  });

  it('rejects a wrong password, the same address, and a wrong code', async () => {
    expect(
      (
        await call(emailPOST as H, 'POST', {
          token: ann,
          body: { newEmail: 'x@example.test', password: 'nope' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(emailPOST as H, 'POST', {
          token: ann,
          body: { newEmail: 'ANN@example.test', password: PW },
        })
      ).body.error.code,
    ).toBe('SAME_EMAIL');
    await call(emailPOST as H, 'POST', {
      token: ann,
      body: { newEmail: 'x@example.test', password: PW },
    });
    expect(
      (await call(emailConfirmPOST as H, 'POST', { token: ann, body: { code: '000000' } })).status,
    ).toBe(400);
  });
});

describe('account deletion (P4.12, ✅A6, ✅A7)', () => {
  const del = (token: string, body: object) => call(deletePOST as H, 'POST', { token, body });

  it('needs the password and typing DELETE', async () => {
    expect((await del(ann, { password: 'nope', confirm: 'DELETE' })).status).toBe(403);
    expect((await del(ann, { password: PW, confirm: 'delete' })).status).toBe(400);
  });

  it('immediately stops sign-in, sessions, posting and the public profile; posts show "deleted user"', async () => {
    await importOsmPlaces(db, [
      { type: 'node', id: 1, lat: 30.315, lon: -81.686, tags: { amenity: 'cafe', name: 'C' } },
    ]);
    const place = await db.businessPlace.findFirstOrThrow();
    await call(favPUT as H, 'PUT', { token: ann, id: place.id, body: {} });
    await call(postsPOST as H, 'POST', {
      token: ann,
      body: { reading: reading(), body: 'before I go' },
    });

    expect((await del(ann, { password: PW, confirm: 'DELETE' })).status).toBe(200);
    expect((await call(meGET as H, 'GET', { token: ann })).status).toBe(401);
    expect(await login('ann_a')).toBeUndefined();
    const profile = await call(profilePOST as H, 'POST', {
      token: ben,
      params: { username: 'ann_a' },
      body: { reading: reading() },
    });
    expect(profile.status).toBe(404);
    const feed = await call(feedPOST as H, 'POST', { token: ben, body: { reading: reading() } });
    expect(feed.body.posts[0]).toMatchObject({ body: 'before I go', author: { deleted: true } });
    expect(await db.favoritePlace.count()).toBe(0);
    const d = await db.accountDeletion.findFirstOrThrow();
    expect(d.purgeAfter.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
    expect(mail.sent.at(-1)?.subject).toMatch(/deleted/);
  });

  it('after 30 days the email is crypto-shredded, the name freed, and the email can sign up again', async () => {
    await del(ann, { password: PW, confirm: 'DELETE' });
    expect((await runMaintenance(new Date(Date.now() + 20 * DAY)))?.accountsPurged).toBe(0);
    expect((await runMaintenance(new Date(Date.now() + 31 * DAY)))?.accountsPurged).toBe(1);
    const u = await db.user.findFirstOrThrow({ where: { status: 'DELETED' } });
    expect([u.emailEnc, u.dekWrapped, u.emailIndex]).toEqual([null, null, null]);
    expect(u.username).toMatch(/^deleted_/);
    expect(() => decryptUserEmail(u)).toThrow();
    expect((await db.accountDeletion.findFirstOrThrow()).status).toBe('COMPLETED');
    const again = await signUp('ann_again', 'ann@example.test');
    expect(again).toBeTruthy();
  });

  // 🔒 D37: legal hold blocks crypto-shredding.
  it('an account on legal hold is not purged', async () => {
    await del(ann, { password: PW, confirm: 'DELETE' });
    await db.user.updateMany({
      where: { status: 'DELETED' },
      data: { legalHoldAt: new Date(), legalHoldNote: 'police request' },
    });
    expect((await runMaintenance(new Date(Date.now() + 400 * DAY)))?.accountsPurged).toBe(0);
    const u = await db.user.findFirstOrThrow({ where: { status: 'DELETED' } });
    expect(decryptUserEmail(u)).toBe('ann@example.test');
  });
});

describe('public profiles and blocking (P4.8, P5.2, ✅A2)', () => {
  const profile = (token: string, username: string) =>
    call(profilePOST as H, 'POST', { token, params: { username }, body: { reading: reading() } });

  it('shows username, bio, join date and recent posts, and nothing private', async () => {
    await db.profile.updateMany({
      where: { user: { usernameNormalized: 'ann_a' } },
      data: { bio: 'Hi' },
    });
    await call(postsPOST as H, 'POST', { token: ann, body: { reading: reading(), body: 'hello' } });
    const r = await profile(ben, 'ANN_A');
    expect(r.status).toBe(200);
    expect(r.body.profile).toMatchObject({
      username: 'ann_a',
      bio: 'Hi',
      postCount: 1,
      isMe: false,
      blockedByMe: false,
    });
    expect(r.body.posts.map((p: { body: string }) => p.body)).toEqual(['hello']);
    expect(findForbiddenKeys(r.body)).toEqual([]);
    expect(r.raw).not.toMatch(/ann@example|1990|argon2/);
  });

  it('404 for unknown, malformed, banned names', async () => {
    expect((await profile(ben, 'nobody_here')).status).toBe(404);
    expect((await profile(ben, '../etc')).status).toBe(404);
    await db.user.updateMany({
      where: { usernameNormalized: 'ann_a' },
      data: { status: 'BANNED' },
    });
    expect((await profile(ben, 'ann_a')).status).toBe(404);
  });

  it('blocking: idempotent, listed, hides content both ways, and hides the blocker’s profile', async () => {
    await call(postsPOST as H, 'POST', {
      token: ann,
      body: { reading: reading(), body: 'from ann' },
    });
    expect(
      (await call(blockPUT as H, 'PUT', { token: ben, params: { username: 'ann_a' }, body: {} }))
        .status,
    ).toBe(200);
    await call(blockPUT as H, 'PUT', { token: ben, params: { username: 'ann_a' }, body: {} });
    expect(await db.userBlock.count()).toBe(1);
    expect(
      (await call(blocksGET as H, 'GET', { token: ben })).body.blocks.map(
        (b: { username: string }) => b.username,
      ),
    ).toEqual(['ann_a']);
    expect(
      (await call(feedPOST as H, 'POST', { token: ben, body: { reading: reading() } })).body.posts,
    ).toEqual([]);
    expect((await profile(ben, 'ann_a')).body.profile.blockedByMe).toBe(true);
    expect((await profile(ann, 'ben_b')).status).toBe(404); // the blocked person can't see the blocker
    await call(blockDELETE as H, 'DELETE', { token: ben, params: { username: 'ann_a' }, body: {} });
    expect(await db.userBlock.count()).toBe(0);
  });

  it("can't block yourself", async () => {
    const r = await call(blockPUT as H, 'PUT', {
      token: ann,
      params: { username: 'ann_a' },
      body: {},
    });
    expect(r.body.error.code).toBe('CANNOT_BLOCK_SELF');
  });
});
