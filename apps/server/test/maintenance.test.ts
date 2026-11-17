import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as healthGET } from '@/app/api/v1/health/route';
import { POST as switchPOST } from '@/app/api/v1/admin/maintenance/route';
import { POST as loginPOST } from '@/app/api/v1/auth/login/route';
import { GET as statusGET } from '@/app/api/v1/maintenance/route';
import { GET as sessionGET } from '@/app/api/v1/session/route';
import { createSession } from '@/server/auth/sessions';
import { db } from '@/server/db';
import { invalidateMaintenanceCache, MAINTENANCE_TEXT } from '@/server/maintenance';
import { adminHeaders } from './admin-helpers';
import { resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D246: the emergency maintenance switch.
const PASSWORD = 'correct horse battery staple 1';
const ADMIN_PATH = '/api/v1/admin/maintenance';

let userId: string;
let userToken: string;
let adminId: string;

const flip = async (enabled: boolean, extra: object = {}) =>
  call(switchPOST as H, 'POST', {
    body: { enabled, reason: 'testing the switch', ...extra },
    headers: await adminHeaders(adminId),
    path: ADMIN_PATH,
  });

beforeEach(async () => {
  await resetDb();
  invalidateMaintenanceCache();
  const user = await createTestUser('mt_user', { emailVerifiedAt: new Date() });
  userId = user.id;
  userToken = (await createSession(user.id, 'MOBILE')).token;
  adminId = (await createTestUser('mt_admin', { role: 'ADMIN' })).id;
}, 60_000);

afterEach(() => invalidateMaintenanceCache());

describe('maintenance switch (D246)', () => {
  it('is off by default: the app works and the status line says so', async () => {
    expect((await call(sessionGET as H, 'GET', { token: userToken })).status).toBe(200);
    const s = await call(statusGET as H, 'GET', { path: '/api/v1/maintenance' });
    expect(s.body).toMatchObject({ on: false, message: null, text: MAINTENANCE_TEXT });
  });

  it('on: everyone is signed out and every app request says maintenance', async () => {
    const r = await flip(true, { message: 'Back by 3 PM.' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ enabled: true, signedOut: 1 });

    const blocked = await call(sessionGET as H, 'GET', { token: userToken });
    expect(blocked.status).toBe(503);
    expect(blocked.body.error).toMatchObject({ code: 'MAINTENANCE', message: 'Back by 3 PM.' });
    // the session itself was ended, not only blocked
    expect(await db.session.count({ where: { userId, kind: 'MOBILE', revokedAt: null } })).toBe(0);

    const s = await call(statusGET as H, 'GET', { path: '/api/v1/maintenance' });
    expect(s.body).toMatchObject({ on: true, message: 'Back by 3 PM.' });
  });

  it('uses the standard line when the admin adds none', async () => {
    await flip(true);
    const blocked = await call(sessionGET as H, 'GET', { token: userToken });
    expect(blocked.body.error.message).toBe(MAINTENANCE_TEXT);
  });

  // 🔒 Bypass: a valid password and a fresh sign-in must not get past the switch.
  it('on: nobody can sign in, even with the right password', async () => {
    await flip(true);
    const login = await call(loginPOST as H, 'POST', {
      body: { identifier: 'mt_user', password: PASSWORD },
    });
    expect(login.status).toBe(503);
    expect(login.body.error.code).toBe('MAINTENANCE');
    // a session minted while it is on still gets nowhere
    const sneaky = (await createSession(userId, 'MOBILE')).token;
    expect((await call(sessionGET as H, 'GET', { token: sneaky })).status).toBe(503);
  });

  it('on: the admin portal API, the health check and the status line keep working', async () => {
    await flip(true);
    expect((await call(healthGET as H, 'GET', { path: '/api/v1/health' })).status).toBe(200);
    expect((await call(statusGET as H, 'GET', { path: '/api/v1/maintenance' })).status).toBe(200);
    expect((await flip(true, { message: 'Still working on it.' })).status).toBe(200);
  });

  it('off: people can use the app again (they sign in again)', async () => {
    await flip(true);
    expect((await flip(false)).status).toBe(200);
    expect((await call(statusGET as H, 'GET', { path: '/api/v1/maintenance' })).body.on).toBe(
      false,
    );
    // the old session is gone, so it asks for sign-in rather than maintenance
    expect((await call(sessionGET as H, 'GET', { token: userToken })).status).toBe(401);
    const fresh = (await createSession(userId, 'MOBILE')).token;
    expect((await call(sessionGET as H, 'GET', { token: fresh })).status).toBe(200);
  });

  it('keeps admin portal sessions signed in when it is switched on', async () => {
    const headers = await adminHeaders(adminId);
    await flip(true);
    expect(
      await db.session.count({ where: { userId: adminId, kind: 'ADMIN', revokedAt: null } }),
    ).toBeGreaterThan(0);
    const again = await call(switchPOST as H, 'POST', {
      body: { enabled: false, reason: 'switching back off' },
      headers,
      path: ADMIN_PATH,
    });
    expect(again.status).toBe(200);
  });

  it('audits each change with who and why', async () => {
    await flip(true);
    await flip(false);
    const rows = await db.adminAuditLog.findMany({
      where: { action: { in: ['MAINTENANCE_ON', 'MAINTENANCE_OFF'] } },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((x) => x.action)).toEqual(['MAINTENANCE_ON', 'MAINTENANCE_OFF']);
    expect(rows[0]).toMatchObject({ adminId });
    expect(rows[0]!.metadata).toMatchObject({ reason: 'testing the switch', signedOut: 1 });
  });

  // 🔒 Only admins.
  it('refuses a regular user and a visitor', async () => {
    const asUser = await call(switchPOST as H, 'POST', {
      token: userToken,
      body: { enabled: true, reason: 'let me in' },
      path: ADMIN_PATH,
    });
    expect(asUser.status).toBeGreaterThanOrEqual(401);
    const anon = await call(switchPOST as H, 'POST', {
      body: { enabled: true, reason: 'let me in' },
      path: ADMIN_PATH,
    });
    expect(anon.status).toBeGreaterThanOrEqual(401);
    expect((await call(sessionGET as H, 'GET', { token: userToken })).status).toBe(200);
  });

  it('needs a reason and refuses unknown fields', async () => {
    const headers = await adminHeaders(adminId);
    const noReason = await call(switchPOST as H, 'POST', {
      body: { enabled: true },
      headers,
      path: ADMIN_PATH,
    });
    expect(noReason.status).toBe(400);
    const extra = await call(switchPOST as H, 'POST', {
      body: { enabled: true, reason: 'fine reason', everyone: true },
      headers,
      path: ADMIN_PATH,
    });
    expect(extra.status).toBe(400);
  });
});
