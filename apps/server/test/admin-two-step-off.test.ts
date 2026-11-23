import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as adminLoginPOST } from '@/app/api/v1/admin/login/route';
import { POST as adminVerifyPOST } from '@/app/api/v1/admin/login/verify/route';
import { GET as adminSummaryGET } from '@/app/api/v1/admin/summary/route';
import { ADMIN_COOKIE, adminTwoStepRequired, CSRF_COOKIE } from '@/server/admin/auth';
import { timeStep, totpAt } from '@/server/admin/totp';
import { hashPassword } from '@/server/auth/crypto';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D274: two-step sign-in switched off for the portal on the owner's computer.

const PW = 'correct horse battery';
let adminId: string;

const step1 = (identifier = 'boss_2s', password = PW) =>
  (adminLoginPOST as H)(
    new Request('http://localhost/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    }),
    undefined as never,
  );

/** Sets up the authenticator once (with two-step on), as the owner already has. */
async function enroll() {
  const r1 = await call(adminLoginPOST as H, 'POST', {
    body: { identifier: 'boss_2s', password: PW },
  });
  const secret: string = r1.body.enroll.secret;
  const r2 = await call(adminVerifyPOST as H, 'POST', {
    body: { challenge: r1.body.challenge, code: totpAt(secret, timeStep(new Date())) },
  });
  expect(r2.status).toBe(200);
}

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  delete process.env.ADMIN_2FA_DISABLED;
  adminId = (
    await createTestUser('boss_2s', {
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
      passwordHash: await hashPassword(PW),
    })
  ).id;
});
afterEach(() => {
  delete process.env.ADMIN_2FA_DISABLED;
});

describe('two-step sign-in switched off (D274)', () => {
  it('signs an enrolled admin in with the password alone, audited as without two-step', async () => {
    await enroll();
    process.env.ADMIN_2FA_DISABLED = 'true';
    const res = await step1();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ signedIn: true, challenge: null });
    const set = res.headers.getSetCookie();
    const get = (name: string) =>
      set
        .find((c) => c.startsWith(`${name}=`))!
        .split(';')[0]!
        .slice(name.length + 1);
    const cookie = `${ADMIN_COOKIE}=${get(ADMIN_COOKIE)}; ${CSRF_COOKIE}=${get(CSRF_COOKIE)}`;
    expect((await call(adminSummaryGET as H, 'GET', { headers: { cookie } })).status).toBe(200);
    const last = await db.adminAuditLog.findFirstOrThrow({
      where: { adminId, action: 'ADMIN_SIGN_IN' },
      orderBy: { createdAt: 'desc' },
    });
    expect(last.metadata).toEqual({ twoStep: false });
  });

  // 🔒 The password still has to be right, and only admins get in.
  it('still refuses a wrong password and non-admins', async () => {
    await enroll();
    process.env.ADMIN_2FA_DISABLED = 'true';
    expect((await step1('boss_2s', 'wrong password here')).status).toBe(401);
    await createTestUser('plain_2s', {
      emailVerifiedAt: new Date(),
      passwordHash: await hashPassword(PW),
    });
    expect((await step1('plain_2s')).status).toBe(403);
  });

  it('an admin who never set up an authenticator gets in with the password too', async () => {
    process.env.ADMIN_2FA_DISABLED = 'true';
    const res = await step1();
    expect(await res.json()).toMatchObject({ signedIn: true, enroll: null });
    const set = res.headers.getSetCookie();
    const get = (name: string) =>
      set
        .find((c) => c.startsWith(`${name}=`))!
        .split(';')[0]!
        .slice(name.length + 1);
    const cookie = `${ADMIN_COOKIE}=${get(ADMIN_COOKIE)}; ${CSRF_COOKIE}=${get(CSRF_COOKIE)}`;
    expect((await call(adminSummaryGET as H, 'GET', { headers: { cookie } })).status).toBe(200);
    // 🔒 Switched back on, that session no longer works until an authenticator is set up.
    delete process.env.ADMIN_2FA_DISABLED;
    expect((await call(adminSummaryGET as H, 'GET', { headers: { cookie } })).status).toBe(403);
  });

  it('with the switch unset, the code is asked for as before', async () => {
    await enroll();
    const body = await (await step1()).json();
    expect(body).toMatchObject({ signedIn: false, enroll: null });
    expect(body.challenge).toEqual(expect.any(String));
  });

  // 🔒 A production server always asks for the code, whatever the setting says.
  it('production ignores the switch', () => {
    process.env.ADMIN_2FA_DISABLED = 'true';
    expect(adminTwoStepRequired('production')).toBe(true);
    expect(adminTwoStepRequired('development')).toBe(false);
  });
});
