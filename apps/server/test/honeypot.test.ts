import { beforeEach, describe, expect, it } from 'vitest';
import { POST as installPOST } from '@/app/api/v1/installations/route';
import { POST as registerPOST } from '@/app/api/v1/auth/register/route';
import { POST as loginPOST } from '@/app/api/v1/auth/login/route';
import { POST as verifyCodePOST } from '@/app/api/v1/auth/verify-email/code/route';
import { GET as meGET } from '@/app/api/v1/me/route';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { INSTALLATION_HEADER } from '@/server/installations';
import { setMailer } from '@/server/mail/mailer';
import { resetDb } from './db-helpers';
import { call, captureMailer, codeFromMail } from './http-helpers';

type H = Parameters<typeof call>[0];
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
    ...overrides,
  };
}

const user = () => db.user.findUniqueOrThrow({ where: { usernameNormalized: 'riverrat' } });
const trapReports = (userId: string) =>
  db.report.findMany({ where: { reportedUserId: userId, reporterUserId: null } });

describe('bot trap (D160)', () => {
  it('a normal sign-up and confirmation (checkbox unticked) are untouched', async () => {
    const r = await call(registerPOST, 'POST', {
      body: registration({ newsletterOptIn: false }),
    });
    expect(r.status).toBe(202);
    const l = await call(loginPOST, 'POST', {
      body: { identifier: 'RiverRat', password: PASSWORD },
    });
    const v = await call(verifyCodePOST, 'POST', {
      token: l.body.token,
      body: { code: codeFromMail(mail.sent[0]!), newsletterOptIn: false },
    });
    expect(v.status).toBe(200);
    const u = await user();
    expect(u.status).toBe('ACTIVE');
    expect(await trapReports(u.id)).toHaveLength(0);
  });

  // 🔒 Ticking the hidden box at sign-up bans the account and its installation, but the bot
  // sees the usual reply, gets no email, and can't sign in.
  it('sign-up with the box ticked bans the account, reports it, and looks normal', async () => {
    const instToken = (await call(installPOST as H, 'POST', { body: {} })).body.installationToken;
    const r = await call(registerPOST, 'POST', {
      headers: { [INSTALLATION_HEADER]: instToken },
      body: registration({ newsletterOptIn: true }),
    });
    expect(r.status).toBe(202);
    expect(r.body.status).toBe('verification_sent');
    expect(mail.sent).toHaveLength(0);

    const u = await user();
    expect(u.status).toBe('BANNED');
    const reports = await trapReports(u.id);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.status).toBe('OPEN');
    expect(reports[0]!.details).toMatch(/Bot trap.*sign-up/);
    expect((await db.installation.findFirstOrThrow()).bannedAt).not.toBeNull();

    const l = await call(loginPOST, 'POST', {
      body: { identifier: 'RiverRat', password: PASSWORD },
    });
    expect(l.status).not.toBe(200);
  });

  // 🔒 Ticking it on the confirmation screen bans even with a valid code, and ends the session.
  it('confirmation with the box ticked bans, reports, and signs the account out', async () => {
    await call(registerPOST, 'POST', { body: registration() });
    const l = await call(loginPOST, 'POST', {
      body: { identifier: 'RiverRat', password: PASSWORD },
    });
    const v = await call(verifyCodePOST, 'POST', {
      token: l.body.token,
      body: { code: codeFromMail(mail.sent[0]!), newsletterOptIn: true },
    });
    expect(v.status).toBe(403);
    expect(v.body.error.code).toBe('ACCOUNT_BANNED');

    const u = await user();
    expect(u.status).toBe('BANNED');
    expect(u.emailVerifiedAt).toBeNull();
    const reports = await trapReports(u.id);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.details).toMatch(/email confirmation/);
    expect((await call(meGET as H, 'GET', { token: l.body.token })).status).not.toBe(200);
  });

  // 🔒 The schemas stay strict: the trap field must be a boolean, and other fields are refused.
  it('rejects a non-boolean trap value and unknown fields', async () => {
    for (const extra of [{ newsletterOptIn: 'yes' }, { marketing: true }]) {
      const r = await call(registerPOST, 'POST', { body: registration(extra) });
      expect(r.status).toBe(400);
    }
    expect(await db.user.count()).toBe(0);
  });
});
