import { beforeEach, describe, expect, it } from 'vitest';
import { POST as registerPOST } from '@/app/api/v1/auth/register/route';
import { POST as loginPOST } from '@/app/api/v1/auth/login/route';
import { POST as verifyLinkPOST } from '@/app/api/v1/auth/verify-email/route';
import { POST as verifyCodePOST } from '@/app/api/v1/auth/verify-email/code/route';
import { POST as resetRequestPOST } from '@/app/api/v1/auth/password-reset/request/route';
import { POST as resetLinkPOST } from '@/app/api/v1/auth/password-reset/confirm/route';
import { POST as resetCodePOST } from '@/app/api/v1/auth/password-reset/confirm-code/route';
import { GET as meGET } from '@/app/api/v1/me/route';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { setMailer } from '@/server/mail/mailer';
import { resetDb } from './db-helpers';
import { call, captureMailer, codeFromMail, tokenFromMail } from './http-helpers';

const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'a brand new password';
let mail: ReturnType<typeof captureMailer>;

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  mail = captureMailer();
  setMailer(mail.mailer);
});

async function signUp(username = 'RiverRat', email = 'river@example.test') {
  await call(registerPOST, 'POST', {
    body: {
      username,
      email,
      password: PASSWORD,
      birthYear: 1990,
      acceptTerms: true,
      confirmAdult: true,
    },
  });
  const l = await call(loginPOST, 'POST', { body: { identifier: username, password: PASSWORD } });
  return { token: l.body.token as string, mail: mail.sent.at(-1)! };
}

function wrongCode(right: string): string {
  return right === '000000' ? '000001' : '000000';
}

describe('email contents (D31)', () => {
  it('verification and reset emails carry both a 6-digit code and a link', async () => {
    const { mail: verify } = await signUp();
    expect(codeFromMail(verify)).toMatch(/^\d{6}$/);
    expect(tokenFromMail(verify).length).toBeGreaterThan(20);
    expect(verify.subject).toMatch(/^\d{3} \d{3} is your Jax confirmation code$/);

    await call(resetRequestPOST, 'POST', { body: { email: 'river@example.test' } });
    const reset = mail.sent.at(-1)!;
    expect(codeFromMail(reset)).toMatch(/^\d{6}$/);
    expect(tokenFromMail(reset).length).toBeGreaterThan(20);
  });

  it('stores only an HMAC of the code, never the code', async () => {
    const { mail: verify } = await signUp();
    const code = codeFromMail(verify);
    const row = await db.emailToken.findFirstOrThrow({ where: { purpose: 'VERIFY_EMAIL' } });
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.codeHash).not.toContain(code);
  });
});

describe('verify email by code (D31)', () => {
  it('confirms the email when the right code is typed (spaces allowed)', async () => {
    const { token, mail: m } = await signUp();
    const code = codeFromMail(m);
    const r = await call(verifyCodePOST, 'POST', {
      token,
      body: { code: `${code.slice(0, 3)} ${code.slice(3)}` },
    });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('verified');
    expect((await call(meGET, 'GET', { token })).body.user.emailVerified).toBe(true);
  });

  it('requires a session', async () => {
    const r = await call(verifyCodePOST, 'POST', { body: { code: '123456' } });
    expect(r.status).toBe(401);
  });

  // 🔒 Brute-force cap: 5 wrong guesses kill the code, even if the 6th is right.
  it('locks the code after 5 wrong guesses', async () => {
    const { token, mail: m } = await signUp();
    const code = codeFromMail(m);
    for (let i = 0; i < 5; i++) {
      const r = await call(verifyCodePOST, 'POST', { token, body: { code: wrongCode(code) } });
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('INVALID_CODE');
    }
    const r = await call(verifyCodePOST, 'POST', { token, body: { code } });
    expect(r.status).toBe(400);
    // The link from the same email is dead too.
    const link = await call(verifyLinkPOST, 'POST', { body: { token: tokenFromMail(m) } });
    expect(link.status).toBe(400);
  });

  it('rejects an expired code (15 min) even though the link still works', async () => {
    const { token, mail: m } = await signUp();
    await db.emailToken.updateMany({ data: { codeExpiresAt: new Date(Date.now() - 1000) } });
    const r = await call(verifyCodePOST, 'POST', { token, body: { code: codeFromMail(m) } });
    expect(r.status).toBe(400);
    const link = await call(verifyLinkPOST, 'POST', { body: { token: tokenFromMail(m) } });
    expect(link.status).toBe(200);
  });

  // 🔒 A code only works for the account it was sent to.
  it("rejects another user's code", async () => {
    const a = await signUp('alice_a', 'a@example.test');
    const b = await signUp('bob_b', 'b@example.test');
    const r = await call(verifyCodePOST, 'POST', {
      token: b.token,
      body: { code: codeFromMail(a.mail) },
    });
    // Could match by chance only if both codes are equal (1 in a million).
    if (codeFromMail(a.mail) !== codeFromMail(b.mail)) expect(r.status).toBe(400);
  });

  it('code and link share one single-use token: after the code, the link is dead', async () => {
    const { token, mail: m } = await signUp();
    await call(verifyCodePOST, 'POST', { token, body: { code: codeFromMail(m) } });
    const link = await call(verifyLinkPOST, 'POST', { body: { token: tokenFromMail(m) } });
    expect(link.status).toBe(400);
  });
});

describe('reset password by code (D31)', () => {
  async function requestReset(email = 'river@example.test') {
    await call(resetRequestPOST, 'POST', { body: { email } });
    return mail.sent.at(-1)!;
  }

  it('resets the password and signs out every session', async () => {
    const { token } = await signUp();
    const code = codeFromMail(await requestReset());
    const r = await call(resetCodePOST, 'POST', {
      body: { email: 'river@example.test', code, newPassword: NEW_PASSWORD },
    });
    expect(r.status).toBe(200);
    expect((await call(meGET, 'GET', { token })).status).toBe(401);
    const login = await call(loginPOST, 'POST', {
      body: { identifier: 'riverrat', password: NEW_PASSWORD },
    });
    expect(login.status).toBe(200);
    // Single use.
    const again = await call(resetCodePOST, 'POST', {
      body: { email: 'river@example.test', code, newPassword: 'yet another password' },
    });
    expect(again.status).toBe(400);
  });

  // 🔒 No account-existence disclosure: unknown email, wrong code and expired code look the same.
  it('unknown email and wrong code give the identical error', async () => {
    await signUp();
    const code = codeFromMail(await requestReset());
    const unknown = await call(resetCodePOST, 'POST', {
      body: { email: 'nobody@example.test', code, newPassword: NEW_PASSWORD },
    });
    const wrong = await call(resetCodePOST, 'POST', {
      body: { email: 'river@example.test', code: wrongCode(code), newPassword: NEW_PASSWORD },
    });
    expect(unknown.status).toBe(400);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('a verification code cannot be used to reset a password (purpose binding)', async () => {
    const { mail: m } = await signUp();
    const r = await call(resetCodePOST, 'POST', {
      body: { email: 'river@example.test', code: codeFromMail(m), newPassword: NEW_PASSWORD },
    });
    expect(r.status).toBe(400);
  });

  it('locks after 5 wrong guesses; the password is unchanged', async () => {
    await signUp();
    const code = codeFromMail(await requestReset());
    for (let i = 0; i < 5; i++) {
      await call(resetCodePOST, 'POST', {
        body: { email: 'river@example.test', code: wrongCode(code), newPassword: NEW_PASSWORD },
      });
    }
    const r = await call(resetCodePOST, 'POST', {
      body: { email: 'river@example.test', code, newPassword: NEW_PASSWORD },
    });
    expect(r.status).toBe(400);
    const login = await call(loginPOST, 'POST', {
      body: { identifier: 'riverrat', password: PASSWORD },
    });
    expect(login.status).toBe(200);
  });

  it('the browser link still works for reset (fallback)', async () => {
    await signUp();
    const m = await requestReset();
    const r = await call(resetLinkPOST, 'POST', {
      body: { token: tokenFromMail(m), newPassword: NEW_PASSWORD },
    });
    expect(r.status).toBe(200);
  });

  // 🔒 Spraying guesses across many accounts from one IP is capped (20 per 15 min).
  it('caps wrong codes per IP across accounts', async () => {
    for (let i = 0; i < 20; i++) {
      await call(resetCodePOST, 'POST', {
        body: { email: `nobody${i}@example.test`, code: '123456', newPassword: NEW_PASSWORD },
      });
    }
    const r = await call(resetCodePOST, 'POST', {
      body: { email: 'nobody@example.test', code: '123456', newPassword: NEW_PASSWORD },
    });
    expect(r.status).toBe(429);
  });
});
