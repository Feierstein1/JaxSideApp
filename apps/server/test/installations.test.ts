import { beforeEach, describe, expect, it } from 'vitest';
import { POST as installPOST } from '@/app/api/v1/installations/route';
import { POST as registerPOST } from '@/app/api/v1/auth/register/route';
import { POST as loginPOST } from '@/app/api/v1/auth/login/route';
import { hashToken } from '@/server/auth/crypto';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { INSTALLATION_HEADER, resolveInstallation } from '@/server/installations';
import { setMailer } from '@/server/mail/mailer';
import { resetDb } from './db-helpers';
import { call, captureMailer } from './http-helpers';

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  setMailer(captureMailer().mailer);
});

const PASSWORD = 'correct horse battery';
const registration = {
  username: 'Installer',
  email: 'installer@example.test',
  password: PASSWORD,
  birthYear: 1990,
  acceptTerms: true,
  confirmAdult: true,
};

async function newInstallation(): Promise<string> {
  const r = await call(installPOST, 'POST', { body: {} });
  expect(r.status).toBe(201);
  return r.body.installationToken;
}

describe('installations (P2.7)', () => {
  it('issues a random token and stores only its hash, never a hardware ID', async () => {
    const token = await newInstallation();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = await db.installation.findFirstOrThrow();
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.tokenHash).not.toBe(token);
    expect(row.integrityStatus).toBe('unverified'); // P2.8 stub
  });

  it('the response contains only the token (no internal ID)', async () => {
    const r = await call(installPOST, 'POST', { body: {} });
    expect(Object.keys(r.body)).toEqual(['installationToken']);
  });

  it('rejects any input fields (the client cannot choose an ID)', async () => {
    const r = await call(installPOST, 'POST', { body: { id: 'mine', deviceId: 'AA:BB' } });
    expect(r.status).toBe(400);
    expect(await db.installation.count()).toBe(0);
  });

  it('is rate-limited per IP (11th in an hour is 429)', async () => {
    for (let i = 0; i < 10; i++) await newInstallation();
    expect((await call(installPOST, 'POST', { body: {} })).status).toBe(429);
  });

  it('resolves the installation from the request header; unknown tokens resolve to null', async () => {
    const token = await newInstallation();
    const req = (t?: string) =>
      new Request('http://x', { headers: t ? { [INSTALLATION_HEADER]: t } : {} });
    expect((await resolveInstallation(req(token)))?.tokenHash).toBe(hashToken(token));
    expect(await resolveInstallation(req('x'.repeat(43)))).toBeNull();
    expect(await resolveInstallation(req())).toBeNull();
  });

  it('records the installation on the session created at sign-in', async () => {
    const token = await newInstallation();
    await call(registerPOST, 'POST', { body: registration });
    const r = await call(loginPOST, 'POST', {
      body: { identifier: 'installer', password: PASSWORD },
      headers: { [INSTALLATION_HEADER]: token },
    });
    expect(r.status).toBe(200);
    const session = await db.session.findFirstOrThrow({ include: { installation: true } });
    expect(session.installation?.tokenHash).toBe(hashToken(token));
  });

  // 🔒 Ban carry-over (MS4): a banned install can't open new accounts or sign in.
  it('a banned installation cannot register or sign in', async () => {
    const token = await newInstallation();
    await call(registerPOST, 'POST', { body: registration });
    await db.installation.updateMany({ data: { bannedAt: new Date() } });

    const reg = await call(registerPOST, 'POST', {
      body: { ...registration, username: 'Second', email: 'second@example.test' },
      headers: { [INSTALLATION_HEADER]: token },
    });
    expect(reg.status).toBe(403);
    expect(reg.body.error.code).toBe('INSTALLATION_BANNED');
    expect(await db.user.count()).toBe(1);

    const login = await call(loginPOST, 'POST', {
      body: { identifier: 'installer', password: PASSWORD },
      headers: { [INSTALLATION_HEADER]: token },
    });
    expect(login.status).toBe(403);
    expect(await db.session.count()).toBe(0);
  });
});
