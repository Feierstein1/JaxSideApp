import { beforeEach, describe, expect, it } from 'vitest';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as logoutRoute } from '@/app/api/auth/logout/route';
import { GET as meRoute } from '@/app/api/auth/me/route';
import { POST as passwordRoute } from '@/app/api/auth/password/route';
import { POST as setupRoute } from '@/app/api/auth/two-factor/setup/route';
import { IDLE_MINUTES, LOCK_MINUTES, MAX_FAILED_LOGINS, SESSION_HOURS } from '@/server/auth';
import { db } from '@/server/db';
import { LIMITS } from '@/server/rate-limit';
import { HOST, PASSWORD, authed, makeAccount, post, resetBusinessData, signIn } from './helpers';

beforeEach(resetBusinessData);

describe('business sign-in', () => {
  it('signs in, sets an httpOnly SameSite=Strict cookie and a readable CSRF cookie', async () => {
    await makeAccount();
    const { res, raw } = await signIn();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.account).toEqual({
      id: expect.any(String),
      email: 'owner@example.com',
      username: null,
      mustChangePassword: false,
      twoFactorOn: false,
    });
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|argon2|totp/i);
    const sessionCookie = raw.find((c) => c.startsWith('jax_biz='))!;
    expect(sessionCookie).toMatch(/HttpOnly/);
    expect(sessionCookie).toMatch(/SameSite=Strict/);
    expect(raw.find((c) => c.startsWith('jax_biz_csrf='))).not.toMatch(/HttpOnly/);
  });

  it('accepts the email in any case and with spaces around it', async () => {
    await makeAccount();
    expect((await signIn('  Owner@Example.COM ')).res.status).toBe(200);
  });

  it('signs employees in with their username', async () => {
    await makeAccount({ username: 'sarah.bb' });
    const r = await signIn('Sarah.BB');
    expect(r.res.status).toBe(200);
    expect((await r.res.json()).account.username).toBe('sarah.bb');
  });

  it('stores only hashes of the tokens', async () => {
    await makeAccount();
    const { session, csrf } = await signIn();
    const rows = await db.businessSession.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(session);
    expect(rows[0]!.csrfTokenHash).not.toBe(csrf);
  });

  it('refuses a wrong password and an unknown name with the same answer', async () => {
    await makeAccount();
    const wrong = await signIn('owner@example.com', 'not the password');
    const unknown = await signIn('nobody@example.com');
    expect(wrong.res.status).toBe(401);
    expect(unknown.res.status).toBe(401);
    expect(await wrong.res.json()).toEqual(await unknown.res.json());
    expect(wrong.raw).toHaveLength(0);
  });

  it('locks the account after repeated wrong passwords, even for the right one', async () => {
    await makeAccount();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++)
      await signIn('owner@example.com', 'wrong password!');
    expect((await signIn()).res.status).toBe(429);
    const row = await db.businessAccount.findUniqueOrThrow({
      where: { email: 'owner@example.com' },
    });
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + (LOCK_MINUTES - 1) * 60_000);
  });

  it('rate limits sign-in attempts per name, even for names that do not exist', async () => {
    for (let i = 0; i < LIMITS.loginPerIdentifier.limit; i++) {
      expect((await signIn('ghost@example.com')).res.status).toBe(401);
    }
    expect((await signIn('ghost@example.com')).res.status).toBe(429);
  });

  it('rate limits sign-in attempts per IP across names', async () => {
    for (let i = 0; i < LIMITS.loginPerIp.limit; i++) await signIn(`n${i}@example.com`);
    const r = await signIn('fresh@example.com');
    expect(r.res.status).toBe(429);
    expect((await r.res.json()).error.code).toBe('RATE_LIMITED');
  });

  it('refuses a revoked account like an unknown one', async () => {
    const a = await makeAccount();
    await db.businessAccount.update({ where: { id: a.id }, data: { revokedAt: new Date() } });
    expect((await signIn()).res.status).toBe(401);
  });

  it('says "suspended" only after the right password', async () => {
    const a = await makeAccount();
    await db.businessAccount.update({ where: { id: a.id }, data: { suspendedAt: new Date() } });
    expect((await signIn('owner@example.com', 'wrong password!')).res.status).toBe(401);
    const right = await signIn();
    expect(right.res.status).toBe(403);
    expect((await right.res.json()).error.code).toBe('SUSPENDED');
    expect(right.raw).toHaveLength(0);
  });

  it('rejects unknown fields and bad shapes', async () => {
    const res = await loginRoute(
      post('/api/auth/login', { identifier: 'a@b.co', password: 'x', admin: true }),
      {},
    );
    expect(res.status).toBe(400);
    const missing = await loginRoute(post('/api/auth/login', { identifier: 'a@b.co' }), {});
    expect(missing.status).toBe(400);
  });

  it('refuses a sign-in posted from another site', async () => {
    await makeAccount();
    const res = await loginRoute(
      post(
        '/api/auth/login',
        { identifier: 'owner@example.com', password: PASSWORD },
        { origin: 'https://evil.example' },
      ),
      {},
    );
    expect(res.status).toBe(403);
  });
});

describe('business session guard', () => {
  it('lets a signed-in account read /me', async () => {
    await makeAccount();
    const s = await signIn();
    const res = await meRoute(authed('GET', '/api/auth/me', s), {});
    expect(res.status).toBe(200);
    expect((await res.json()).account.email).toBe('owner@example.com');
  });

  it('refuses no cookie, a made-up token, and a Bearer token', async () => {
    await makeAccount();
    const s = await signIn();
    const none = await meRoute(
      new Request(`http://${HOST}/api/auth/me`, { headers: { host: HOST } }),
      {},
    );
    expect(none.status).toBe(401);
    const fake = await meRoute(
      authed('GET', '/api/auth/me', { session: 'made-up', csrf: 'x' }),
      {},
    );
    expect(fake.status).toBe(401);
    // 🔒 A token sent the way the phone app sends it is ignored: this site reads cookies only.
    const bearer = await meRoute(
      new Request(`http://${HOST}/api/auth/me`, {
        headers: { host: HOST, authorization: `Bearer ${s.session}` },
      }),
      {},
    );
    expect(bearer.status).toBe(401);
  });

  it('requires the CSRF token for changes', async () => {
    await makeAccount();
    const s = await signIn();
    const noToken = await logoutRoute(
      new Request(`http://${HOST}/api/auth/logout`, {
        method: 'POST',
        headers: { host: HOST, cookie: `jax_biz=${s.session}` },
      }),
      {},
    );
    expect(noToken.status).toBe(403);
    const wrongToken = await logoutRoute(
      authed('POST', '/api/auth/logout', { ...s, csrf: 'nope' }),
      {},
    );
    expect(wrongToken.status).toBe(403);
    // Still signed in after the refused attempts.
    expect((await meRoute(authed('GET', '/api/auth/me', s), {})).status).toBe(200);
  });

  it('signs out: the session stops working and the cookies are cleared', async () => {
    await makeAccount();
    const s = await signIn();
    const out = await logoutRoute(authed('POST', '/api/auth/logout', s), {});
    expect(out.status).toBe(200);
    expect(out.headers.getSetCookie().every((c) => /Max-Age=0/.test(c))).toBe(true);
    expect((await meRoute(authed('GET', '/api/auth/me', s), {})).status).toBe(401);
  });

  it('ends sessions that are expired, idle, or belong to a revoked or suspended account', async () => {
    const a = await makeAccount();
    const me = (s: { session?: string; csrf?: string }) =>
      meRoute(authed('GET', '/api/auth/me', s), {}).then((r) => r.status);

    let s = await signIn();
    await db.businessSession.updateMany({
      data: { expiresAt: new Date(Date.now() - (SESSION_HOURS + 1) * 3_600_000) },
    });
    expect(await me(s)).toBe(401);

    s = await signIn();
    await db.businessSession.updateMany({
      where: { revokedAt: null },
      data: { lastUsedAt: new Date(Date.now() - (IDLE_MINUTES + 1) * 60_000) },
    });
    expect(await me(s)).toBe(401);

    s = await signIn();
    await db.businessAccount.update({ where: { id: a.id }, data: { suspendedAt: new Date() } });
    expect(await me(s)).toBe(403);

    await db.businessAccount.update({
      where: { id: a.id },
      data: { suspendedAt: null, revokedAt: new Date() },
    });
    expect(await me(s)).toBe(401);
  });
});

describe('password change', () => {
  it('a forced change blocks everything but sign-out, /me and the change itself', async () => {
    await makeAccount({ username: 'new.hire', mustChangePassword: true });
    const s = await signIn('new.hire');
    expect(s.res.status).toBe(200);
    expect((await s.res.json()).account.mustChangePassword).toBe(true);

    expect((await meRoute(authed('GET', '/api/auth/me', s), {})).status).toBe(200);
    const blocked = await setupRoute(authed('POST', '/api/auth/two-factor/setup', s), {});
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const changed = await passwordRoute(
      authed('POST', '/api/auth/password', s, {
        currentPassword: PASSWORD,
        newPassword: 'a brand new password',
      }),
      {},
    );
    expect(changed.status).toBe(200);
    expect((await setupRoute(authed('POST', '/api/auth/two-factor/setup', s), {})).status).toBe(
      200,
    );
  });

  it('needs the current password, a 10+ character new one, and a different one', async () => {
    await makeAccount();
    const s = await signIn();
    const change = (currentPassword: string, newPassword: string) =>
      passwordRoute(
        authed('POST', '/api/auth/password', s, { currentPassword, newPassword }),
        {},
      ).then((r) => r.status);
    expect(await change('wrong password!', 'a brand new password')).toBe(400);
    expect(await change(PASSWORD, 'short')).toBe(400);
    expect(await change(PASSWORD, PASSWORD)).toBe(400);
    expect(await change(PASSWORD, ' leading space pw')).toBe(400);
  });

  it('signs out other devices, and only the new password works afterwards', async () => {
    await makeAccount();
    const here = await signIn();
    const other = await signIn();
    const res = await passwordRoute(
      authed('POST', '/api/auth/password', here, {
        currentPassword: PASSWORD,
        newPassword: 'a brand new password',
      }),
      {},
    );
    expect(res.status).toBe(200);
    expect((await meRoute(authed('GET', '/api/auth/me', here), {})).status).toBe(200);
    expect((await meRoute(authed('GET', '/api/auth/me', other), {})).status).toBe(401);
    expect((await signIn()).res.status).toBe(401);
    expect((await signIn('owner@example.com', 'a brand new password')).res.status).toBe(200);
    const row = await db.businessAccount.findUniqueOrThrow({
      where: { email: 'owner@example.com' },
    });
    expect(row.passwordChangedAt).not.toBeNull();
  });
});

describe('🔒 phone-app and business sessions never cross', () => {
  it('a phone-app session token is not a business session', async () => {
    const user = await db.user.create({
      data: {
        username: 'crossover',
        usernameNormalized: 'crossover',
        passwordHash: 'x',
        ageCutoffYear: 2007,
        tosAcceptedAt: new Date(),
        tosVersion: 'test',
        adultConfirmedAt: new Date(),
        // A live user needs encrypted email fields (D35), which only the app can make.
        // The account's status doesn't matter here: the token is what's being tested.
        status: 'BANNED',
      },
    });
    const { generateToken, hashToken } = await import('@/server/crypto');
    const appToken = generateToken();
    await db.session.create({
      data: {
        userId: user.id,
        kind: 'MOBILE',
        tokenHash: hashToken(appToken),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    try {
      const asCookie = await meRoute(
        authed('GET', '/api/auth/me', { session: appToken, csrf: 'x' }),
        {},
      );
      expect(asCookie.status).toBe(401);
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  });
});
