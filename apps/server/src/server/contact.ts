import type { z } from 'zod';
import type { ContactDecision, contactSchema } from '@jax/shared';
import type { Actor } from './auth/require-actor';
import { decryptUserEmail } from './crypto/field-encryption';
import { db } from './db';
import { getEnv } from './env';
import { ApiError } from './http';
import { sendSafely } from './mail/mailer';
import { contactAnswerEmail } from './mail/templates';
import { pageWindow, toPage } from './admin/paging';

/**
 * D90: Contact us. Signed-in people and guests can send a support ticket or a general
 * message; moderators read them in the admin portal. A person's email is shown to a
 * moderator only on a message where they turned on "You can reply to my account email"
 * (and that viewing is written to the audit log). Guests can't be replied to.
 */

type ContactInput = z.infer<typeof contactSchema>;

export async function createContactMessage(actor: Actor, input: ContactInput) {
  const msg = await db.contactMessage.create({
    data: {
      category: input.category,
      subject: input.subject,
      body: input.body,
      ...(actor.kind === 'user'
        ? { userId: actor.user.id, allowReply: input.allowReply }
        : { guestSessionId: actor.guest.id, allowReply: false }),
    },
  });
  // Optional copy to an inbox. Never includes the person's email address.
  const inbox = getEnv().SUPPORT_INBOX;
  if (inbox) {
    const from = actor.kind === 'user' ? `@${actor.user.username}` : 'a guest';
    await sendSafely(
      {
        to: inbox,
        subject: `[JaxSide ${input.category === 'SUPPORT' ? 'support ticket' : 'contact'}] ${input.subject}`,
        text:
          `From ${from}.\n\n${input.body}\n\n` +
          `Open the admin portal (Messages) to see it${input.allowReply && actor.kind === 'user' ? ' and the reply address' : ''}.`,
      },
      'contact-copy',
    );
  }
  return { id: msg.id };
}

/** Contact messages (open ones oldest first), 20 a page (D210). */
export async function listContactMessages(opts: {
  status: 'OPEN' | 'NEEDS_INFO' | 'RESOLVED';
  category?: 'SUPPORT' | 'GENERAL';
  page?: number;
}) {
  const page = opts.page ?? 1;
  const where = { status: opts.status, ...(opts.category ? { category: opts.category } : {}) };
  const [rows, total] = await Promise.all([
    db.contactMessage.findMany({
      where,
      orderBy: [{ createdAt: opts.status === 'OPEN' ? 'asc' : 'desc' }, { id: 'asc' }],
      ...pageWindow(page),
      include: {
        user: { select: { id: true, username: true, status: true } },
        resolvedBy: { select: { username: true } },
        // D213: a ticket from a business login (owner website): the login and its place.
        businessAccount: {
          select: {
            id: true,
            email: true,
            username: true,
            placeAccess: {
              where: { revokedAt: null },
              orderBy: { createdAt: 'asc' },
              take: 1,
              select: { place: { select: { name: true } } },
            },
          },
        },
      },
    }),
    db.contactMessage.count({ where }),
  ]);
  const list = rows.map((m) => ({
    id: m.id,
    category: m.category,
    subject: m.subject,
    body: m.body,
    status: m.status,
    createdAt: m.createdAt,
    resolvedAt: m.resolvedAt,
    resolvedBy: m.resolvedBy?.username ?? null,
    adminNote: m.adminNote,
    from: m.user
      ? { id: m.user.id, username: m.user.username, status: m.user.status }
      : m.businessAccount
        ? {
            business: true as const,
            accountId: m.businessAccount.id,
            login: m.businessAccount.username ?? m.businessAccount.email ?? '',
            place: m.businessAccount.placeAccess[0]?.place.name ?? null,
          }
        : m.guestSessionId
          ? 'guest'
          : 'deleted',
    // D213: a business ticket can always be answered (its reply address or the login's email).
    canReply:
      (m.allowReply && !!m.user) ||
      (!!m.businessAccount && !!(m.replyEmail ?? m.businessAccount.email)),
  }));
  return toPage(list, total, page);
}

/**
 * The reply address for one message, only if its sender allowed it. The caller audits
 * the viewing.
 */
export async function contactReplyEmail(id: string): Promise<string | null> {
  const m = await db.contactMessage.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, dekWrapped: true, emailEnc: true } },
      businessAccount: { select: { email: true } },
    },
  });
  if (!m) throw new ApiError(404, 'NOT_FOUND', 'Not found');
  // D213: a business ticket: the address its form asked for, or the login's own email.
  if (m.businessAccount) return m.replyEmail ?? m.businessAccount.email ?? null;
  if (!m.allowReply || !m.user) return null;
  try {
    return decryptUserEmail(m.user);
  } catch {
    return null; // the account was deleted and its email shredded
  }
}

/**
 * D251: answer a ticket. "Resolved" (optional note) or "Need more details" (a note saying
 * what's needed) emails the sender in the branded look, when they can be emailed: a business
 * ticket always (its reply address or the login's email), a person only if they turned on
 * replies, a guest never. "Reopen" puts it back in Open without an email. Returns whether an
 * email went out.
 */
export async function answerContact(id: string, adminId: string, decision: ContactDecision) {
  const now = new Date();
  const note = decision.action === 'reopen' ? null : decision.note?.trim() || null;
  const res = await db.contactMessage.updateMany({
    where: { id },
    data:
      decision.action === 'reopen'
        ? { status: 'OPEN', resolvedAt: null, resolvedById: null }
        : {
            status: decision.action === 'resolve' ? 'RESOLVED' : 'NEEDS_INFO',
            resolvedAt: now,
            resolvedById: adminId,
            adminNote: note,
          },
  });
  if (res.count !== 1) throw new ApiError(404, 'NOT_FOUND', 'Not found');
  if (decision.action === 'reopen') return { emailed: false };
  const to = await contactReplyEmail(id);
  if (!to) return { emailed: false };
  const m = await db.contactMessage.findUniqueOrThrow({
    where: { id },
    select: { subject: true, businessAccountId: true },
  });
  const env = getEnv();
  const business = !!m.businessAccountId;
  await sendSafely(
    contactAnswerEmail({
      to,
      kind: decision.action === 'resolve' ? 'resolved' : 'needs_info',
      subject: m.subject,
      note,
      business,
      businessContactUrl:
        business && env.BUSINESS_SITE_URL
          ? new URL('/contact', env.BUSINESS_SITE_URL).toString()
          : null,
      replyTo: env.SUPPORT_INBOX ?? null,
    }),
    'contact-answer',
  );
  return { emailed: true };
}
