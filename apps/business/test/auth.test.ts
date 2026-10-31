import { beforeEach, describe, expect, it } from 'vitest';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as logoutRoute } from '@/app/api/auth/logout/route';
import { GET as meRoute } from '@/app/api/auth/me/route';
import { IDLE_MINUTES, LOCK_MINUTES, MAX_FAILED_LOGINS, SESSION_HOURS } from '@/server/auth';
import { hashPassword } from '@/server/crypto';
import { db } from '@/server/db';

const PASSWORD = 'correct horse battery';
const HOST = 'business.test';

async function makeAccount(email = 'owner@example.com') {
  return db.businessAccount.create({
    data: { email, passwordHash: await hashPassword(PASSWORD) },
  });
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://${HOST}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: HOST, ...headers },
    body: JSON.stringify(body),
  });
}

/** Signs in through the route and returns the cookie values the browser would hold. */
async function signIn(email = 'owner@example.com', password = PASSWORD) {
  const res = await loginRoute(post('/api/auth/login', { email, password }), {});
  const cookies = res.headers.getSetCookie();
  const value = (name: string) =>
    cookies
      .find((c) => c.startsWith(`${name}=`))
      ?.split(';')[0]
      ?.slice(name.length + 1);
  return { res, session: value('jax_biz'), csrf: value('jax_biz_csrf'), cookies };
}

function authed(method: 'GET' | 'POST', path: string, s: { session?: string; csrf?: string }) {
  return new Request(`http://${HOST}${path}`, {
    method,
    headers: {
      host: HOST,
      cookie: `jax_biz=${s.session}; jax_biz_csrf=${s.csrf}`,
      ...(method === 'POST' && s.csrf ? { 'x-csrf-token': s.csrf } : {}),
    },
  });
}

beforeEach(async () => {
  await db.businessSession.deleteMany();
  await db.businessAccount.deleteMany();
});

describe('business sign-in', () => {
  it('signs in, sets an httpOnly SameSite=Strict cookie and a readable CSRF cookie', async () => {
    await makeAccount();
    const { res, cookies } = await signIn();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.account.email).toBe('owner@example.com');
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|argon2/);
    const sessionCookie = cookies.find((c) => c.startsWith('jax_biz='))!;
    expect(sessionCookie).toMatch(/HttpOnly/);
    expect(sessionCookie).toMatch(/SameSite=Strict/);
    expect(cookies.find((c) => c.startsWith('jax_biz_csrf='))).not.toMatch(/HttpOnly/);
  });

  it('stores only hashes of the tokens', async () => {
    await makeAccount();
    const { session, csrf } = await signIn();
    const rows = await db.businessSession.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(session);
    expect(rows[0]!.csrfTokenHash).not.toBe(csrf);
  });

  it('refuses a wrong password and an unknown email with the same answer', async () => {
    await makeAccount();
    const wrong = await signIn('owner@example.com', 'not the password');
    const unknown = await signIn('nobody@example.com');
    expect(wrong.res.status).toBe(401);
    expect(unknown.res.status).toBe(401);
    expect(await wrong.res.json()).toEqual(await unknown.res.json());
    expect(wrong.cookies).toHaveLength(0);
  });

  it('locks the account after repeated wrong passwords, even for the right one', async () => {
    await makeAccount();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++)
      await signIn('owner@example.com', 'wrong password!');
    const locked = await signIn();
    expect(locked.res.status).toBe(429);
    const row = await db.businessAccount.findUniqueOrThrow({
      where: { email: 'owner@example.com' },
    });
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + (LOCK_MINUTES - 1) * 60_000);
  });

  it('refuses a revoked account', async () => {
    const a = await makeAccount();
    await db.businessAccount.update({ where: { id: a.id }, data: { revokedAt: new Date() } });
    expect((await signIn()).res.status).toBe(401);
  });

  it('rejects unknown fields and bad shapes', async () => {
    const res = await loginRoute(
      post('/api/auth/login', { email: 'a@b.co', password: 'x', admin: true }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it('refuses a sign-in posted from another site', async () => {
    await makeAccount();
    const res = await loginRoute(
      post(
        '/api/auth/login',
        { email: 'owner@example.com', password: PASSWORD },
        {
          origin: 'https://evil.example',
        },
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

  it('ends sessions that are expired, idle, or belong to a revoked account', async () => {
    const a = await makeAccount();
    const long = new Date(Date.now() - (SESSION_HOURS + 1) * 3_600_000);
    const idle = new Date(Date.now() - (IDLE_MINUTES + 1) * 60_000);

    let s = await signIn();
    await db.businessSession.updateMany({ data: { expiresAt: long } });
    expect((await meRoute(authed('GET', '/api/auth/me', s), {})).status).toBe(401);

    await db.businessSession.deleteMany();
    s = await signIn();
    await db.businessSession.updateMany({ data: { lastUsedAt: idle } });
    expect((await meRoute(authed('GET', '/api/auth/me', s), {})).status).toBe(401);

    await db.businessSession.deleteMany();
    s = await signIn();
    await db.businessAccount.update({ where: { id: a.id }, data: { revokedAt: new Date() } });
    expect((await meRoute(authed('GET', '/api/auth/me', s), {})).status).toBe(401);
  });
});
