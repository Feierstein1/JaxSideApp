import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as adminLoginPOST } from '@/app/api/v1/admin/login/route';
import { POST as adminVerifyPOST } from '@/app/api/v1/admin/login/verify/route';
import { POST as adminLogoutPOST } from '@/app/api/v1/admin/logout/route';
import { GET as adminSummaryGET } from '@/app/api/v1/admin/summary/route';
import { GET as meGET } from '@/app/api/v1/me/route';
import { ADMIN_COOKIE, CSRF_COOKIE, CSRF_HEADER } from '@/server/admin/auth';
import { base32Encode, matchTotp, timeStep, totpAt } from '@/server/admin/totp';
import { hashPassword } from '@/server/auth/crypto';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

const PW = 'correct horse battery';
const MIN = 60_000;

let adminId: string;

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  adminId = (
    await createTestUser('boss_ad', {
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
      passwordHash: await hashPassword(PW),
    })
  ).id;
  await createTestUser('plain_ad', {
    emailVerifiedAt: new Date(),
    passwordHash: await hashPassword(PW),
  });
});

const step1 = (identifier = 'boss_ad', password = PW) =>
  call(adminLoginPOST as H, 'POST', { body: { identifier, password } });
const step2 = (challenge: string, code: string) =>
  call(adminVerifyPOST as H, 'POST', { body: { challenge, code } });

/** Signs in fully; returns the cookie header and CSRF token. */
async function signIn() {
  const r1 = await step1();
  const secret: string = r1.body.enroll.secret;
  const res = await (adminVerifyPOST as H)(
    new Request('http://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        challenge: r1.body.challenge,
        code: totpAt(secret, timeStep(new Date())),
      }),
    }),
    undefined as never,
  );
  expect(res.status).toBe(200);
  const set = res.headers.getSetCookie();
  const get = (name: string) =>
    set
      .find((c) => c.startsWith(`${name}=`))!
      .split(';')[0]!
      .slice(name.length + 1);
  const token = get(ADMIN_COOKIE);
  const csrf = get(CSRF_COOKIE);
  return { cookie: `${ADMIN_COOKIE}=${token}; ${CSRF_COOKIE}=${csrf}`, token, csrf, secret, set };
}

describe('TOTP (RFC 6238)', () => {
  // RFC 6238 appendix B vectors (SHA-1), last 6 digits.
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('at %i s the code is %s', (seconds, code) => {
    expect(totpAt(secret, Math.floor(seconds / 30))).toBe(code);
  });

  it('accepts one step of clock drift, not more', () => {
    const now = new Date(1_700_000_000_000);
    const s = timeStep(now);
    expect(matchTotp(secret, totpAt(secret, s - 1), now)).toBe(s - 1);
    expect(matchTotp(secret, totpAt(secret, s + 2), now)).toBeNull();
    expect(matchTotp(secret, 'abc123', now)).toBeNull();
  });
});

describe('admin sign-in (P5.11, D4, ✅D8)', () => {
  it('first sign-in sets up the authenticator; the cookies are httpOnly + SameSite=Strict', async () => {
    const r1 = await step1();
    expect(r1.status).toBe(200);
    expect(r1.body.enroll.otpauthUrl).toMatch(/^otpauth:\/\/totp\/Jax%20Admin/);
    expect(r1.body.enroll.qrSvg).toMatch(/^<svg/);
    const { set, secret } = await signIn();
    expect(set.find((c) => c.startsWith(`${ADMIN_COOKIE}=`))).toMatch(/HttpOnly; SameSite=Strict/);
    const u = await db.user.findUniqueOrThrow({ where: { id: adminId } });
    expect(u.totpEnabledAt).not.toBeNull();
    expect(u.totpSecretEnc).not.toContain(secret); // stored encrypted
    // Later sign-ins don't show the secret again.
    expect((await step1()).body.enroll).toBeNull();
    expect(await db.adminAuditLog.count({ where: { adminId } })).toBe(1);
  });

  // 🔒 negative cases
  it('non-admins, wrong passwords and wrong codes are refused', async () => {
    const plain = await step1('plain_ad');
    expect(plain.status).toBe(403);
    expect(plain.body.error.code).toBe('NOT_ADMIN');
    expect((await step1('boss_ad', 'wrong password!')).status).toBe(401);
    const r1 = await step1();
    expect((await step2(r1.body.challenge, '000000')).body.error.code).toBe('INVALID_CODE');
  });

  it('a code works only once (no replay)', async () => {
    const r1 = await step1();
    const code = totpAt(r1.body.enroll.secret, timeStep(new Date()));
    expect((await step2(r1.body.challenge, code)).status).toBe(200);
    const again = await step1();
    expect((await step2(again.body.challenge, code)).status).toBe(401);
  });

  it('a tampered or expired challenge is refused', async () => {
    const r1 = await step1();
    const code = totpAt(r1.body.enroll.secret, timeStep(new Date()));
    const parts = (r1.body.challenge as string).split('.');
    const forged = [
      (await db.user.findFirstOrThrow({ where: { username: 'plain_ad' } })).id,
      ...parts.slice(1),
    ].join('.');
    expect((await step2(forged, code)).body.error.code).toBe('CHALLENGE_EXPIRED');
    const old = [parts[0], Date.now() - 1, parts[2], parts[3]].join('.');
    expect((await step2(old, code)).body.error.code).toBe('CHALLENGE_EXPIRED');
  });

  it('wrong codes are rate-limited (6th in 15 minutes is 429)', async () => {
    const r1 = await step1();
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await step2(r1.body.challenge, '000000')).status);
    expect(codes).toEqual([401, 401, 401, 401, 401, 429]);
  });
});

describe('admin session guard (P5.11, ✅D8)', () => {
  it('the dashboard API needs the admin cookie', async () => {
    const { cookie } = await signIn();
    expect((await call(adminSummaryGET as H, 'GET', { headers: { cookie } })).status).toBe(200);
    expect((await call(adminSummaryGET as H, 'GET')).status).toBe(401);
  });

  // 🔒 app sessions and admin sessions don't cross over.
  it('an app (Bearer) session never works on admin routes, and vice versa', async () => {
    const mobile = (await createSession(adminId, 'MOBILE')).token;
    expect((await call(adminSummaryGET as H, 'GET', { token: mobile })).status).toBe(401);
    expect(
      (
        await call(adminSummaryGET as H, 'GET', {
          headers: { cookie: `${ADMIN_COOKIE}=${mobile}` },
        })
      ).status,
    ).toBe(401);
    const { token } = await signIn();
    expect((await call(meGET as H, 'GET', { token })).status).toBe(401);
  });

  it('changes need the CSRF token', async () => {
    const { cookie, csrf } = await signIn();
    const without = await call(adminLogoutPOST as H, 'POST', { headers: { cookie } });
    expect(without.status).toBe(403);
    expect(without.body.error.code).toBe('CSRF');
    const wrong = await call(adminLogoutPOST as H, 'POST', {
      headers: { cookie, [CSRF_HEADER]: 'nope' },
    });
    expect(wrong.status).toBe(403);
    const ok = await call(adminLogoutPOST as H, 'POST', {
      headers: { cookie, [CSRF_HEADER]: csrf },
    });
    expect(ok.status).toBe(200);
    // Signed out: the cookie no longer works.
    expect((await call(adminSummaryGET as H, 'GET', { headers: { cookie } })).status).toBe(401);
  });

  it('30 minutes idle ends the session', async () => {
    const { cookie } = await signIn();
    await db.session.updateMany({
      where: { kind: 'ADMIN' },
      data: { lastUsedAt: new Date(Date.now() - 31 * MIN) },
    });
    expect((await call(adminSummaryGET as H, 'GET', { headers: { cookie } })).status).toBe(401);
  });

  it('losing the admin role ends access at once', async () => {
    const { cookie } = await signIn();
    await db.user.update({ where: { id: adminId }, data: { role: 'USER' } });
    expect((await call(adminSummaryGET as H, 'GET', { headers: { cookie } })).status).toBe(403);
  });

  // 🔒 every admin route is guarded: no admin cookie → 401 (sign-in routes excepted).
  it('every /api/v1/admin route refuses requests without an admin session', async () => {
    const root = path.resolve(import.meta.dirname, '../src/app/api/v1/admin');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name === 'route.ts') files.push(p);
      }
    };
    walk(root);
    const PUBLIC = new Set(['login', 'login/verify']);
    let checked = 0;
    for (const file of files) {
      const rel = path.relative(root, path.dirname(file)).split(path.sep).join('/');
      if (PUBLIC.has(rel)) continue;
      const mod = (await import(file)) as Record<string, H>;
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        const handler = mod[method];
        if (!handler) continue;
        const mobile = (await createSession(adminId, 'MOBILE')).token;
        const r = await call(handler, method, {
          token: mobile,
          body: method === 'GET' ? undefined : {},
          params: { id: '00000000-0000-7000-8000-000000000000' },
        });
        expect([rel, method, r.status]).toEqual([rel, method, 401]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(2);
  });
});

describe('portal switch (D62)', () => {
  it('ADMIN_PORTAL_ENABLED=false makes every admin route a 404, even with a valid session', async () => {
    const { cookie } = await signIn();
    process.env.ADMIN_PORTAL_ENABLED = 'false';
    try {
      expect((await call(adminSummaryGET as H, 'GET', { headers: { cookie } })).status).toBe(404);
      expect((await step1()).status).toBe(404);
    } finally {
      delete process.env.ADMIN_PORTAL_ENABLED;
    }
    expect((await call(adminSummaryGET as H, 'GET', { headers: { cookie } })).status).toBe(200);
  });
});
