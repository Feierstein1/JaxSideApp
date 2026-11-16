import { beforeEach, describe, expect, it } from 'vitest';
import { POST as contactPOST } from '@/app/api/v1/contact/route';
import { POST as resolvePOST } from '@/app/api/v1/admin/contact/[id]/route';
import { GET as replyEmailGET } from '@/app/api/v1/admin/contact/[id]/reply-email/route';
import { POST as guestsPOST } from '@/app/api/v1/guests/route';
import { POST as installPOST } from '@/app/api/v1/installations/route';
import { createSession } from '@/server/auth/sessions';
import { adminSummary } from '@/server/admin/summary';
import { invalidateConfigCache } from '@/server/config';
import { listContactMessages } from '@/server/contact';
import { db } from '@/server/db';
import { INSTALLATION_HEADER } from '@/server/installations';
import { setMailer } from '@/server/mail/mailer';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { captureMailer } from './http-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D90: Contact us.

let ann: string;
let annId: string;
let admin: Record<string, string>;
let mail: ReturnType<typeof captureMailer>;

const ticket = {
  category: 'SUPPORT',
  subject: 'Photos won’t upload',
  body: 'Every time I add a photo it spins and then fails.',
};
const send = (token: string | undefined, body: object = ticket) =>
  call(contactPOST as H, 'POST', { token, body });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  invalidateConfigCache();
  mail = captureMailer();
  setMailer(mail.mailer);
  const a = await createTestUser('ann_c', {
    email: 'ann.private@example.test',
    emailVerifiedAt: new Date(),
  });
  annId = a.id;
  ann = (await createSession(a.id, 'MOBILE')).token;
  admin = await adminHeaders((await createTestUser('mod_c', { role: 'ADMIN' })).id);
});

describe('Contact us (D90)', () => {
  it('a signed-in person sends a support ticket; moderators see it, not their email', async () => {
    expect((await send(ann, { ...ticket, allowReply: true })).status).toBe(201);
    const [m] = (await listContactMessages({ status: 'OPEN' })).rows;
    expect(m).toMatchObject({
      category: 'SUPPORT',
      subject: 'Photos won’t upload',
      canReply: true,
      from: { username: 'ann_c' },
    });
    expect(JSON.stringify(m)).not.toContain('ann.private');
    expect((await adminSummary()).openMessages).toBe(1);
  });

  // 🔒 The email is shown only when the sender allowed it, and each viewing is logged.
  it('reply email: only with permission, audited', async () => {
    await send(ann, { ...ticket, allowReply: true });
    await send(ann, { ...ticket, category: 'GENERAL', subject: 'Love the app' });
    const [withReply, without] = await db.contactMessage.findMany({
      orderBy: { createdAt: 'asc' },
    });
    const email = (id: string, headers = admin) =>
      call(replyEmailGET as H, 'GET', { headers, params: { id } });
    expect((await email(withReply!.id)).body).toEqual({ email: 'ann.private@example.test' });
    expect((await email(without!.id)).body).toEqual({ email: null });
    expect(await db.adminAuditLog.count({ where: { action: 'CONTACT_EMAIL_VIEWED' } })).toBe(1);
    // Not for app sessions.
    expect((await email(withReply!.id, { authorization: `Bearer ${ann}` })).status).toBe(401);
  });

  it('guests can write in but can’t be replied to', async () => {
    const inst = (await call(installPOST as H, 'POST', { body: {} })).body.installationToken;
    const guest = (
      await call(guestsPOST as H, 'POST', { body: {}, headers: { [INSTALLATION_HEADER]: inst } })
    ).body.token as string;
    expect((await send(guest, { ...ticket, allowReply: true })).status).toBe(201);
    const [m] = (await listContactMessages({ status: 'OPEN' })).rows;
    expect(m).toMatchObject({ from: 'guest', canReply: false });
  });

  it('needs a session, valid fields, and is limited to 5 an hour', async () => {
    expect((await send(undefined)).status).toBe(401);
    expect((await send(ann, { ...ticket, subject: 'x' })).status).toBe(400);
    expect((await send(ann, { ...ticket, category: 'SALES' })).status).toBe(400);
    expect((await send(ann, { ...ticket, userId: annId })).status).toBe(400);
    for (let i = 0; i < 5; i++) expect((await send(ann)).status).toBe(201);
    expect((await send(ann)).status).toBe(429);
  });

  it('moderators resolve and reopen; filters by status and category', async () => {
    await send(ann);
    await send(ann, { ...ticket, category: 'GENERAL', subject: 'Hello there' });
    const support = (await listContactMessages({ status: 'OPEN', category: 'SUPPORT' })).rows[0]!;
    const r = await call(resolvePOST as H, 'POST', {
      headers: admin,
      params: { id: support.id },
      body: { action: 'resolve' },
    });
    expect(r.status).toBe(200);
    expect((await listContactMessages({ status: 'OPEN' })).rows).toHaveLength(1);
    const done = (await listContactMessages({ status: 'RESOLVED' })).rows;
    expect(done[0]).toMatchObject({ subject: 'Photos won’t upload', resolvedBy: 'mod_c' });
    await call(resolvePOST as H, 'POST', {
      headers: admin,
      params: { id: support.id },
      body: { action: 'reopen' },
    });
    expect((await listContactMessages({ status: 'OPEN' })).rows).toHaveLength(2);
  });

  // D207 / D213: tickets the owner website writes for business logins.
  describe('from business logins (D213)', () => {
    async function businessTicket(
      username: string | null,
      email: string | null,
      replyEmail?: string,
    ) {
      const a = await db.businessAccount.create({
        data: { email, username, passwordHash: 'x' },
      });
      return db.contactMessage.create({
        data: {
          businessAccountId: a.id,
          category: 'SUPPORT',
          subject: 'Ad help',
          body: 'How do I…',
          replyEmail,
        },
      });
    }
    const email = (id: string) =>
      call(replyEmailGET as H, 'GET', { headers: admin, params: { id } });

    it('the inbox names the business; the reply goes to the form’s address or the login’s email', async () => {
      const owner = await businessTicket(null, 'owner@boldbean.com');
      const staff = await businessTicket('sam.bb', null, 'sam@example.test');
      const rows = (await listContactMessages({ status: 'OPEN' })).rows;
      expect(rows.find((r) => r.id === owner.id)).toMatchObject({
        canReply: true,
        from: { business: true, login: 'owner@boldbean.com' },
      });
      expect(rows.find((r) => r.id === staff.id)?.from).toMatchObject({ login: 'sam.bb' });
      expect((await email(owner.id)).body).toEqual({ email: 'owner@boldbean.com' });
      expect((await email(staff.id)).body).toEqual({ email: 'sam@example.test' });
    });

    // 🔒 A ticket has at most one sender.
    it('the database refuses a ticket from both a person and a business', async () => {
      const a = await db.businessAccount.create({ data: { email: 'x@y.test', passwordHash: 'x' } });
      await expect(
        db.contactMessage.create({
          data: {
            userId: annId,
            businessAccountId: a.id,
            category: 'SUPPORT',
            subject: 's',
            body: 'b',
          },
        }),
      ).rejects.toThrow();
    });
  });

  // D251: answering a ticket emails the sender (when they can be emailed).
  describe('answers by email (D251)', () => {
    const answer = (id: string, body: object) =>
      call(resolvePOST as H, 'POST', { headers: admin, params: { id }, body });
    const answers = () =>
      mail.sent.filter((m) => /^(Resolved|More details needed): /.test(m.subject));
    async function businessTicket(email: string | null, replyEmail?: string) {
      const a = await db.businessAccount.create({
        data: { email, username: email ? null : 'sam.bb', passwordHash: 'x' },
      });
      return db.contactMessage.create({
        data: {
          businessAccountId: a.id,
          category: 'SUPPORT',
          subject: 'Ad help',
          body: 'How do I…',
          replyEmail,
        },
      });
    }

    it('Resolved emails the business, with the note and the FOR BUSINESS look', async () => {
      const t = await businessTicket('owner@boldbean.com');
      const r = await answer(t.id, { action: 'resolve', note: 'Your ad is live now.' });
      expect(r.body).toEqual({ ok: true, emailed: true });
      const [m] = answers();
      expect(m).toMatchObject({ to: 'owner@boldbean.com', subject: 'Resolved: Ad help' });
      expect(m!.text).toContain('Your ad is live now.');
      expect(m!.html).toContain('FOR BUSINESS');
      expect(await db.contactMessage.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({
        status: 'RESOLVED',
        adminNote: 'Your ad is live now.',
      });
      expect(
        await db.adminAuditLog.count({ where: { action: 'CONTACT_RESOLVED', targetId: t.id } }),
      ).toBe(1);
    });

    it('Need more details needs a note, goes to a staff login’s reply address, and has its own list', async () => {
      const t = await businessTicket(null, 'sam@example.test');
      expect((await answer(t.id, { action: 'needs_info' })).status).toBe(400);
      expect((await answer(t.id, { action: 'needs_info', note: ' ' })).status).toBe(400);
      expect(answers()).toHaveLength(0);
      await answer(t.id, { action: 'needs_info', note: 'Which ad do you mean?' });
      expect(answers()[0]).toMatchObject({
        to: 'sam@example.test',
        subject: 'More details needed: Ad help',
      });
      expect(answers()[0]!.text).toContain('Which ad do you mean?');
      expect((await listContactMessages({ status: 'OPEN' })).rows).toHaveLength(0);
      expect((await listContactMessages({ status: 'NEEDS_INFO' })).rows[0]).toMatchObject({
        id: t.id,
        adminNote: 'Which ad do you mean?',
      });
      // Back to Open sends nothing.
      await answer(t.id, { action: 'reopen' });
      expect(answers()).toHaveLength(1);
      expect((await listContactMessages({ status: 'OPEN' })).rows).toHaveLength(1);
    });

    // 🔒 A person is emailed only if they turned on replies; a guest never.
    it('people only with replies on; guests never', async () => {
      await send(ann, { ...ticket, allowReply: true });
      await send(ann, { ...ticket, subject: 'No reply please' });
      const [yes, no] = await db.contactMessage.findMany({ orderBy: { createdAt: 'asc' } });
      expect((await answer(yes!.id, { action: 'resolve' })).body.emailed).toBe(true);
      expect(answers()[0]).toMatchObject({ to: 'ann.private@example.test' });
      expect(answers()[0]!.html).not.toContain('FOR BUSINESS');
      expect((await answer(no!.id, { action: 'needs_info', note: 'Which phone?' })).body).toEqual({
        ok: true,
        emailed: false,
      });
      expect(answers()).toHaveLength(1);
    });

    // 🔒 The note is text, never markup, and unexpected fields are refused.
    it('escapes the note in the email; strict body', async () => {
      const t = await businessTicket('owner@boldbean.com');
      expect((await answer(t.id, { action: 'resolve', status: 'OPEN' })).status).toBe(400);
      await answer(t.id, { action: 'resolve', note: '<a href="x">click</a>' });
      expect(answers()[0]!.html).not.toContain('<a href="x">');
      expect(answers()[0]!.html).toContain('&lt;a href=');
    });
  });
});
