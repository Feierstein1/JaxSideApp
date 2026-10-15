import { beforeEach, describe, expect, it } from 'vitest';
import { POST as registerPOST } from '@/app/api/v1/auth/register/route';
import { POST as loginPOST } from '@/app/api/v1/auth/login/route';
import { POST as logoutPOST } from '@/app/api/v1/auth/logout/route';
import { DELETE as sessionsDELETE } from '@/app/api/v1/auth/sessions/route';
import { POST as verifyPOST } from '@/app/api/v1/auth/verify-email/route';
import { POST as resendPOST } from '@/app/api/v1/auth/verify-email/resend/route';
import { POST as resetRequestPOST } from '@/app/api/v1/auth/password-reset/request/route';
import { POST as resetConfirmPOST } from '@/app/api/v1/auth/password-reset/confirm/route';
import { GET as meGET } from '@/app/api/v1/me/route';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { assertAgeEligible } from '@/server/auth/service';
import { hashToken } from '@/server/auth/crypto';
import { setMailer } from '@/server/mail/mailer';
import { findForbiddenKeys } from '@/server/serializers';
import { resetDb } from './db-helpers';
import { call, captureMailer, tokenFromMail } from './http-helpers';

const PASSWORD = 'correct horse battery';
let mail: ReturnType<typeof captureMailer>;

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  mail = captureMailer();
  setMailer(mail.mailer);
});

function registration(overrides: Record<string, unknown> = {}) {
  return {
    username: 'RiverRat',
    email: 'river@example.test',
    password: PASSWORD,
    birthYear: 1990,
    acceptTerms: true,
    confirmAdult: true,
    ...overrides,
  };
}

async function registerAndLogin(overrides: Record<string, unknown> = {}) {
  const reg = registration(overrides);
  const r = await call(registerPOST, 'POST', { body: reg });
  expect(r.status).toBe(202);
  const l = await call(loginPOST, 'POST', {
    body: { identifier: reg.username, password: reg.password },
  });
  expect(l.status).toBe(200);
  return l.body as { token: string; user: { id: string } };
}

// ───────────────────────────── P1.13 Register ─────────────────────────────

describe('register (P1.13)', () => {
  it('creates the account with an argon2id hash, lowercased email, profile, and hashed verify token', async () => {
    const r = await call(registerPOST, 'POST', {
      body: registration({ email: 'River@Example.TEST' }),
    });
    expect(r.status).toBe(202);
    expect(r.body.status).toBe('verification_sent');

    const user = await db.user.findUniqueOrThrow({
      where: { usernameNormalized: 'riverrat' },
      include: { profile: true, emailTokens: true },
    });
    expect(user.username).toBe('RiverRat');
    expect(user.email).toBe('river@example.test');
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect(user.role).toBe('USER');
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.profile).not.toBeNull();

    expect(mail.sent).toHaveLength(1);
    const token = tokenFromMail(mail.sent[0]);
    expect(user.emailTokens[0]!.tokenHash).toBe(hashToken(token));
    expect(user.emailTokens[0]!.tokenHash).not.toBe(token);
  });

  // 🔒 Client cannot set server-controlled fields.
  it.each(['role', 'status', 'emailVerifiedAt', 'id'])(
    'rejects a request containing %s and creates nothing',
    async (field) => {
      const r = await call(registerPOST, 'POST', { body: { ...registration(), [field]: 'ADMIN' } });
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
      expect(await db.user.count()).toBe(0);
    },
  );

  it('validation errors never echo submitted values', async () => {
    const r = await call(registerPOST, 'POST', {
      body: registration({ password: 'short-pw', email: 'not-an-email' }),
    });
    expect(r.status).toBe(400);
    expect(r.raw).not.toContain('short-pw');
    expect(r.raw).not.toContain('not-an-email');
  });

  it('rejects malformed JSON', async () => {
    const r = await call(registerPOST, 'POST', { rawBody: '{nope' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INVALID_JSON');
  });

  it('rejects a username that differs only by case (409)', async () => {
    await call(registerPOST, 'POST', { body: registration() });
    const r = await call(registerPOST, 'POST', {
      body: registration({ username: 'riverRAT', email: 'other@example.test' }),
    });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('USERNAME_TAKEN');
  });

  // 🔒 No account-existence disclosure through registration.
  it('an already-registered email gets the identical response, no new account, and a notice email', async () => {
    const first = await call(registerPOST, 'POST', { body: registration() });
    const second = await call(registerPOST, 'POST', {
      body: registration({ username: 'SomeoneElse' }),
    });
    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
    expect(await db.user.count()).toBe(1);
    expect(mail.sent[1]?.subject).toMatch(/tried to sign up/);
    expect(mail.sent[1]?.text).not.toMatch(/token=/);
  });

  it('rate-limits registrations per IP (6th in an hour is 429)', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await call(registerPOST, 'POST', {
        body: registration({ username: `user_${i}`, email: `u${i}@example.test` }),
      });
      expect(r.status).toBe(202);
    }
    const r = await call(registerPOST, 'POST', {
      body: registration({ username: 'user_6', email: 'u6@example.test' }),
    });
    expect(r.status).toBe(429);
    expect(r.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
  });
});

// ───────────────────────────── P1.14 Age ─────────────────────────────

describe('age screen (P1.14)', () => {
  it('rejects a too-recent birth year with an explanation, and creates nothing', async () => {
    const year = new Date().getUTCFullYear();
    const r = await call(registerPOST, 'POST', { body: registration({ birthYear: year - 18 }) });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('AGE_INELIGIBLE');
    expect(r.body.error.message).toMatch(/18 and older/);
    expect(await db.user.count()).toBe(0);
  });

  // 🔒 Year-boundary tests with an injected clock (Eastern time, D22).
  it('2008 is rejected at 23:59:59 Dec 31 2026 Eastern and accepted at 00:00 Jan 1 2027', async () => {
    const lastSecond2026 = new Date('2027-01-01T04:59:59Z');
    const firstSecond2027 = new Date('2027-01-01T05:00:00Z');
    await expect(assertAgeEligible(2008, lastSecond2026)).rejects.toMatchObject({
      code: 'AGE_INELIGIBLE',
    });
    await expect(assertAgeEligible(2008, firstSecond2027)).resolves.toBeUndefined();
    await expect(assertAgeEligible(2007, lastSecond2026)).resolves.toBeUndefined();
  });

  it('uses the configured offset from AppConfiguration', async () => {
    await db.appConfiguration.create({ data: { key: 'age.birthYearOffset', value: 21 } });
    invalidateConfigCache();
    const now = new Date('2026-06-01T12:00:00Z');
    await expect(assertAgeEligible(2006, now)).rejects.toMatchObject({ code: 'AGE_INELIGIBLE' });
    await expect(assertAgeEligible(2005, now)).resolves.toBeUndefined();
  });
});

// ───────────────────────────── P1.15 Login ─────────────────────────────

describe('login / logout (P1.15)', () => {
  // D32: phone keyboards can append an invisible space.
  it('accepts the correct password with stray edge spaces, still rejects a wrong one', async () => {
    await call(registerPOST, 'POST', { body: registration() });
    const ok = await call(loginPOST, 'POST', {
      body: { identifier: 'river@example.test', password: ` ${PASSWORD} ` },
    });
    expect(ok.status).toBe(200);
    const bad = await call(loginPOST, 'POST', {
      body: { identifier: 'river@example.test', password: `${PASSWORD}x ` },
    });
    expect(bad.status).toBe(401);
  });

  it('refuses to register a password ending in a space', async () => {
    const r = await call(registerPOST, 'POST', {
      body: registration({ password: `${PASSWORD} ` }),
    });
    expect(r.status).toBe(400);
    expect(await db.user.count()).toBe(0);
  });

  it('logs in by username or email (any case) and stores only the token hash', async () => {
    await call(registerPOST, 'POST', { body: registration() });
    for (const identifier of ['riverrat', 'RIVER@example.test']) {
      const r = await call(loginPOST, 'POST', { body: { identifier, password: PASSWORD } });
      expect(r.status).toBe(200);
      expect(r.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const s = await db.session.findUnique({ where: { tokenHash: hashToken(r.body.token) } });
      expect(s).not.toBeNull();
      expect(await db.session.count({ where: { tokenHash: r.body.token } })).toBe(0);
    }
  });

  // 🔒 Wrong password and unknown account are indistinguishable.
  it('wrong password and unknown user return the same 401', async () => {
    await call(registerPOST, 'POST', { body: registration() });
    const wrong = await call(loginPOST, 'POST', {
      body: { identifier: 'riverrat', password: 'nope-nope-nope' },
    });
    const unknown = await call(loginPOST, 'POST', {
      body: { identifier: 'ghost', password: 'nope-nope-nope' },
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  // 🔒 Per-account throttle: after 10 failures even the right password is refused.
  it('locks the account identifier after 10 failed attempts in 15 minutes', async () => {
    await call(registerPOST, 'POST', { body: registration() });
    for (let i = 0; i < 10; i++) {
      const r = await call(loginPOST, 'POST', {
        body: { identifier: 'riverrat', password: `wrong-password-${i}` },
      });
      expect(r.status).toBe(401);
    }
    const r = await call(loginPOST, 'POST', {
      body: { identifier: 'riverrat', password: PASSWORD },
    });
    expect(r.status).toBe(429);
  });

  // D29: people sharing one IP (carrier NAT, café wifi) can all sign in normally.
  it('successful logins count toward neither the per-account nor the per-IP limit', async () => {
    await call(registerPOST, 'POST', { body: registration() });
    for (let i = 0; i < 20; i++) {
      const r = await call(loginPOST, 'POST', {
        body: { identifier: 'riverrat', password: PASSWORD },
      });
      expect(r.status).toBe(200);
    }
  });

  // 🔒 D29: 15 failed attempts per IP per 15 minutes, spread across many accounts.
  it('after 15 failed logins from one IP, the 16th attempt is refused even with a correct password', async () => {
    await call(registerPOST, 'POST', { body: registration() });
    for (let i = 0; i < 15; i++) {
      const r = await call(loginPOST, 'POST', {
        body: { identifier: `nobody${i}`, password: 'wrong-password' },
      });
      expect(r.status).toBe(401);
    }
    const r = await call(loginPOST, 'POST', {
      body: { identifier: 'riverrat', password: PASSWORD },
    });
    expect(r.status).toBe(429);
    expect(r.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('the per-IP failure limit comes from AppConfiguration', async () => {
    await db.appConfiguration.create({
      data: { key: 'rateLimit.login.per15MinPerIp', value: 3 },
    });
    invalidateConfigCache();
    for (let i = 0; i < 3; i++) {
      await call(loginPOST, 'POST', { body: { identifier: `nobody${i}`, password: 'x' } });
    }
    const r = await call(loginPOST, 'POST', { body: { identifier: 'nobody', password: 'x' } });
    expect(r.status).toBe(429);
  });

  it.each([
    ['BANNED', null, 403, 'ACCOUNT_BANNED'],
    ['SUSPENDED', new Date(Date.now() + 86_400_000), 403, 'ACCOUNT_SUSPENDED'],
    ['DELETED', null, 401, 'INVALID_CREDENTIALS'],
  ] as const)('a %s account cannot log in', async (status, suspendedUntil, code, errCode) => {
    await call(registerPOST, 'POST', { body: registration() });
    await db.user.update({
      where: { usernameNormalized: 'riverrat' },
      data: { status, suspendedUntil, deletedAt: status === 'DELETED' ? new Date() : null },
    });
    const r = await call(loginPOST, 'POST', {
      body: { identifier: 'riverrat', password: PASSWORD },
    });
    expect(r.status).toBe(code);
    expect(r.body.error.code).toBe(errCode);
    expect(await db.session.count()).toBe(0);
  });

  it('an expired suspension no longer blocks login', async () => {
    await call(registerPOST, 'POST', { body: registration() });
    await db.user.update({
      where: { usernameNormalized: 'riverrat' },
      data: { status: 'SUSPENDED', suspendedUntil: new Date(Date.now() - 1000) },
    });
    const r = await call(loginPOST, 'POST', {
      body: { identifier: 'riverrat', password: PASSWORD },
    });
    expect(r.status).toBe(200);
  });

  it('logout revokes only this session', async () => {
    const a = await registerAndLogin();
    const b = await call(loginPOST, 'POST', {
      body: { identifier: 'riverrat', password: PASSWORD },
    });
    expect((await call(logoutPOST, 'POST', { token: a.token })).status).toBe(200);
    expect((await call(meGET, 'GET', { token: a.token })).status).toBe(401);
    expect((await call(meGET, 'GET', { token: b.body.token })).status).toBe(200);
  });

  it('sign-out-everywhere revokes every session', async () => {
    const a = await registerAndLogin();
    const b = await call(loginPOST, 'POST', {
      body: { identifier: 'riverrat', password: PASSWORD },
    });
    const r = await call(sessionsDELETE, 'DELETE', { token: a.token });
    expect(r.body.revoked).toBe(2);
    expect((await call(meGET, 'GET', { token: a.token })).status).toBe(401);
    expect((await call(meGET, 'GET', { token: b.body.token })).status).toBe(401);
  });
});

// ───────────────────────── P1.16 Email verification ─────────────────────────

describe('email verification (P1.16)', () => {
  it('verifies with the emailed token, and the token works only once', async () => {
    await call(registerPOST, 'POST', { body: registration() });
    const token = tokenFromMail(mail.sent[0]);
    expect((await call(verifyPOST, 'POST', { body: { token } })).status).toBe(200);
    const u = await db.user.findUniqueOrThrow({ where: { usernameNormalized: 'riverrat' } });
    expect(u.emailVerifiedAt).not.toBeNull();
    const again = await call(verifyPOST, 'POST', { body: { token } });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects an expired token', async () => {
    await call(registerPOST, 'POST', { body: registration() });
    const token = tokenFromMail(mail.sent[0]);
    await db.emailToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await call(verifyPOST, 'POST', { body: { token } })).status).toBe(400);
  });

  // 🔒 A password-reset token can't be used to verify email (purpose binding).
  it('rejects a token issued for a different purpose', async () => {
    await call(registerPOST, 'POST', { body: registration() });
    await call(resetRequestPOST, 'POST', { body: { email: 'river@example.test' } });
    const resetToken = tokenFromMail(mail.sent[1]);
    expect((await call(verifyPOST, 'POST', { body: { token: resetToken } })).status).toBe(400);
  });

  it('resend issues a new link and invalidates the old one', async () => {
    const { token } = await registerAndLogin();
    const oldLink = tokenFromMail(mail.sent[0]);
    const r = await call(resendPOST, 'POST', { token, body: {} });
    expect(r.body.status).toBe('verification_sent');
    const newLink = tokenFromMail(mail.sent[1]);
    expect((await call(verifyPOST, 'POST', { body: { token: oldLink } })).status).toBe(400);
    expect((await call(verifyPOST, 'POST', { body: { token: newLink } })).status).toBe(200);
  });

  it('resend requires a session and is rate-limited', async () => {
    expect((await call(resendPOST, 'POST', { body: {} })).status).toBe(401);
    const { token } = await registerAndLogin();
    for (let i = 0; i < 3; i++) {
      expect((await call(resendPOST, 'POST', { token, body: {} })).status).toBe(200);
    }
    expect((await call(resendPOST, 'POST', { token, body: {} })).status).toBe(429);
  });
});

// ─────────────────────────── P1.17 Password reset ───────────────────────────

describe('password reset (P1.17)', () => {
  // 🔒 No account-existence disclosure.
  it('known and unknown emails get the identical 202; only the known one gets mail', async () => {
    await call(registerPOST, 'POST', { body: registration() });
    mail.sent.length = 0;
    const known = await call(resetRequestPOST, 'POST', { body: { email: 'river@example.test' } });
    const unknown = await call(resetRequestPOST, 'POST', {
      body: { email: 'nobody@example.test' },
    });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.to).toBe('river@example.test');
  });

  it('resets the password, revokes all sessions, and the link is single-use', async () => {
    const { token: session } = await registerAndLogin();
    await call(resetRequestPOST, 'POST', { body: { email: 'river@example.test' } });
    const resetToken = tokenFromMail(mail.sent.at(-1));

    const r = await call(resetConfirmPOST, 'POST', {
      body: { token: resetToken, newPassword: 'a brand new password' },
    });
    expect(r.status).toBe(200);
    expect((await call(meGET, 'GET', { token: session })).status).toBe(401);

    const oldPw = await call(loginPOST, 'POST', {
      body: { identifier: 'riverrat', password: PASSWORD },
    });
    expect(oldPw.status).toBe(401);
    const newPw = await call(loginPOST, 'POST', {
      body: { identifier: 'riverrat', password: 'a brand new password' },
    });
    expect(newPw.status).toBe(200);

    const reuse = await call(resetConfirmPOST, 'POST', {
      body: { token: resetToken, newPassword: 'yet another password' },
    });
    expect(reuse.status).toBe(400);
  });

  it('rejects an expired reset token (30 min)', async () => {
    await call(registerPOST, 'POST', { body: registration() });
    await call(resetRequestPOST, 'POST', { body: { email: 'river@example.test' } });
    const t = tokenFromMail(mail.sent.at(-1));
    await db.emailToken.updateMany({
      where: { purpose: 'PASSWORD_RESET' },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    const r = await call(resetConfirmPOST, 'POST', {
      body: { token: t, newPassword: 'a brand new password' },
    });
    expect(r.status).toBe(400);
  });

  it('a newer reset link invalidates the older one', async () => {
    await call(registerPOST, 'POST', { body: registration() });
    await call(resetRequestPOST, 'POST', { body: { email: 'river@example.test' } });
    const first = tokenFromMail(mail.sent.at(-1));
    await call(resetRequestPOST, 'POST', { body: { email: 'river@example.test' } });
    const r = await call(resetConfirmPOST, 'POST', {
      body: { token: first, newPassword: 'a brand new password' },
    });
    expect(r.status).toBe(400);
  });

  it('caps reset emails per account (anti mail-bomb) without changing the response', async () => {
    await call(registerPOST, 'POST', { body: registration() });
    mail.sent.length = 0;
    for (let i = 0; i < 5; i++) {
      const r = await call(resetRequestPOST, 'POST', { body: { email: 'river@example.test' } });
      expect(r.status).toBe(202);
    }
    expect(mail.sent).toHaveLength(3);
  });
});

// ─────────────────────────── P1.18 requireActor ───────────────────────────

describe('requireUser guard (P1.18)', () => {
  it.each([
    ['no header', undefined],
    ['malformed header', 'Token abc'],
    ['random token', 'Bearer ' + 'x'.repeat(43)],
  ])('rejects %s with 401', async (_label, authorization) => {
    const r = await call(meGET, 'GET', { headers: authorization ? { authorization } : {} });
    expect(r.status).toBe(401);
  });

  it('rejects an expired session', async () => {
    const { token } = await registerAndLogin();
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await call(meGET, 'GET', { token })).status).toBe(401);
  });

  // 🔒 Status changes after login take effect immediately on the next request.
  it('a user banned after login is refused on the next request', async () => {
    const { token, user } = await registerAndLogin();
    await db.user.update({ where: { id: user.id }, data: { status: 'BANNED' } });
    const r = await call(meGET, 'GET', { token });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('ACCOUNT_BANNED');
  });

  it('a user suspended after login is refused', async () => {
    const { token, user } = await registerAndLogin();
    await db.user.update({
      where: { id: user.id },
      data: { status: 'SUSPENDED', suspendedUntil: new Date(Date.now() + 3_600_000) },
    });
    expect((await call(meGET, 'GET', { token })).status).toBe(403);
  });

  it('a deleted account is refused and its session revoked', async () => {
    const { token, user } = await registerAndLogin();
    await db.user.update({
      where: { id: user.id },
      data: { status: 'DELETED', deletedAt: new Date() },
    });
    expect((await call(meGET, 'GET', { token })).status).toBe(401);
    const s = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(s.revokedAt).not.toBeNull();
  });

  it('extends a mobile session on use (sliding expiry) at most hourly', async () => {
    const { token } = await registerAndLogin();
    const old = new Date(Date.now() - 2 * 3_600_000);
    await db.session.updateMany({
      data: { lastUsedAt: old, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    await call(meGET, 'GET', { token });
    const s = await db.session.findFirstOrThrow();
    expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });
});

// ─────────────────────────── P1.19 Serializers ───────────────────────────

describe('response privacy (P1.19, A2)', () => {
  it('/me returns the owner email but no hash, birth year, role or status internals', async () => {
    const { token } = await registerAndLogin();
    const r = await call(meGET, 'GET', { token });
    expect(r.status).toBe(200);
    expect(r.body.user.email).toBe('river@example.test');
    expect(findForbiddenKeys(r.body, ['email'])).toEqual([]);
    const raw = withoutRandomValues(r.raw, [r.body.user.id]);
    expect(raw).not.toContain('1990');
    expect(raw).not.toContain('argon2');
  });

  it('login response contains no secrets other than the new session token', async () => {
    await call(registerPOST, 'POST', { body: registration() });
    const r = await call(loginPOST, 'POST', {
      body: { identifier: 'riverrat', password: PASSWORD },
    });
    expect(findForbiddenKeys(r.body, ['email'])).toEqual([]);
    const raw = withoutRandomValues(r.raw, [r.body.token, r.body.user.id]);
    expect(raw).not.toContain('argon2');
    expect(raw).not.toContain('1990');
  });
});

/**
 * Removes random values (session token, UUIDs) before scanning raw text, so a check
 * like "no 1990 anywhere" can't fail because a random token happened to contain it.
 */
function withoutRandomValues(raw: string, values: string[]): string {
  return values.reduce((s, v) => s.split(v).join('<random>'), raw);
}
