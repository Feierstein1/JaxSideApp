import { beforeEach, describe, expect, it } from 'vitest';
import { POST as createPOST } from '@/app/api/v1/admin/users/route';
import { POST as loginPOST } from '@/app/api/v1/auth/login/route';
import { POST as deletePOST } from '@/app/api/v1/me/delete/route';
import { POST as emailConfirmPOST } from '@/app/api/v1/me/email/confirm/route';
import { POST as emailPOST } from '@/app/api/v1/me/email/route';
import { GET as meGET } from '@/app/api/v1/me/route';
import { invalidateConfigCache } from '@/server/config';
import { decryptUserEmail } from '@/server/crypto/field-encryption';
import { db } from '@/server/db';
import { setMailer } from '@/server/mail/mailer';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { captureMailer, codeFromMail } from './http-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D273: admins add accounts in the portal; the email is optional.

const PW = 'correct horse battery';
let admin: Record<string, string>;
let mail: ReturnType<typeof captureMailer>;

const create = (body: object, headers = admin) => call(createPOST as H, 'POST', { headers, body });
const base = { username: 'apple_review', password: PW, confirmAdultAndTerms: true };
const login = async (identifier: string, password = PW) =>
  call(loginPOST as H, 'POST', { body: { identifier, password } });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  invalidateConfigCache();
  mail = captureMailer();
  setMailer(mail.mailer);
  admin = await adminHeaders((await createTestUser('mod_u', { role: 'ADMIN' })).id);
});

describe('adding an account in the admin portal (D273)', () => {
  it('with an email: confirmed at once, signs in by username or email, audited', async () => {
    const r = await create({ ...base, email: 'Reviewer@Example.test', reviewAccount: true });
    expect(r.status).toBe(201);
    const u = await db.user.findUniqueOrThrow({ where: { id: r.body.user.id } });
    expect(u).toMatchObject({
      username: 'apple_review',
      role: 'USER',
      adminCreated: true,
      reviewAccount: true,
      tosVersion: expect.any(String),
    });
    expect(u.emailVerifiedAt).not.toBeNull();
    expect(decryptUserEmail(u)).toBe('reviewer@example.test');
    expect((await login('apple_review')).status).toBe(200);
    expect((await login('reviewer@example.test')).status).toBe(200);
    expect(
      await db.adminAuditLog.count({ where: { action: 'USER_CREATED', targetId: u.id } }),
    ).toBe(1);
    // No verification email: it's confirmed already.
    expect(
      mail.sent.filter((m) => m.to === 'reviewer@example.test' && /confirm/i.test(m.subject)),
    ).toHaveLength(0);
  });

  it('without an email: signs in by username, the app shows no email, and one can be added later', async () => {
    const r = await create(base);
    expect(r.status).toBe(201);
    const u = await db.user.findUniqueOrThrow({ where: { id: r.body.user.id } });
    expect(u).toMatchObject({ emailEnc: null, emailIndex: null, adminCreated: true });
    expect(u.dekWrapped).not.toBeNull();
    const s = await login('apple_review');
    expect(s.status).toBe(200);
    const token = s.body.token as string;
    expect((await call(meGET as H, 'GET', { token })).body.user).toMatchObject({
      username: 'apple_review',
      email: '',
    });
    // Adding an email: the code goes to the new address; there's no old one to tell.
    const e = await call(emailPOST as H, 'POST', {
      token,
      body: { newEmail: 'later@example.test', password: PW },
    });
    expect(e.status).toBe(202);
    const code = codeFromMail(mail.sent.find((m) => m.to === 'later@example.test'));
    expect((await call(emailConfirmPOST as H, 'POST', { token, body: { code } })).status).toBe(200);
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(decryptUserEmail(after)).toBe('later@example.test');
  });

  it('an account without an email can be deleted', async () => {
    await create(base);
    const token = (await login('apple_review')).body.token as string;
    const d = await call(deletePOST as H, 'POST', {
      token,
      body: { password: PW, confirm: 'DELETE' },
    });
    expect(d.status).toBe(200);
    expect(
      (await db.user.findFirstOrThrow({ where: { usernameNormalized: 'apple_review' } })).status,
    ).toBe('DELETED');
  });

  it('says plainly when the username or email is taken', async () => {
    await create({ ...base, email: 'one@example.test' });
    expect((await create({ ...base, email: 'two@example.test' })).body.error.code).toBe(
      'USERNAME_TAKEN',
    );
    expect(
      (await create({ ...base, username: 'google_review', email: 'ONE@example.test' })).body.error
        .code,
    ).toBe('EMAIL_TAKEN');
  });

  // 🔒 Admins only; the usual rules; never an admin account; the 18+ / Terms box is required.
  it('refuses non-admins, weak or unexpected input, and a missing confirmation', async () => {
    const user = await createTestUser('plain_u');
    expect((await create(base, { authorization: `Bearer x-${user.id}` })).status).toBe(401);
    expect((await create({ ...base, confirmAdultAndTerms: false })).status).toBe(400);
    expect((await create({ ...base, password: 'short' })).status).toBe(400);
    expect((await create({ ...base, username: 'no spaces' })).status).toBe(400);
    expect((await create({ ...base, role: 'ADMIN' })).status).toBe(400);
    expect((await create({ ...base, email: 'not-an-email' })).status).toBe(400);
    expect(await db.user.count({ where: { usernameNormalized: 'apple_review' } })).toBe(0);
  });

  // 🔒 App sign-up still always has an email: the database refuses an ordinary account without.
  it('only portal-made accounts may lack an email', async () => {
    const u = await createTestUser('regular_u');
    await expect(
      db.user.update({ where: { id: u.id }, data: { emailEnc: null, emailIndex: null } }),
    ).rejects.toThrow();
  });
});
