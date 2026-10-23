import type { z } from 'zod';
import type { contactSchema } from '@jax/shared';
import type { Actor } from './auth/require-actor';
import { decryptUserEmail } from './crypto/field-encryption';
import { db } from './db';
import { getEnv } from './env';
import { ApiError } from './http';
import { sendSafely } from './mail/mailer';

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

export async function listContactMessages(opts: {
  status: 'OPEN' | 'RESOLVED';
  category?: 'SUPPORT' | 'GENERAL';
}) {
  const rows = await db.contactMessage.findMany({
    where: { status: opts.status, ...(opts.category ? { category: opts.category } : {}) },
    orderBy: { createdAt: opts.status === 'OPEN' ? 'asc' : 'desc' },
    take: 200,
    include: {
      user: { select: { id: true, username: true, status: true } },
      resolvedBy: { select: { username: true } },
    },
  });
  return rows.map((m) => ({
    id: m.id,
    category: m.category,
    subject: m.subject,
    body: m.body,
    status: m.status,
    createdAt: m.createdAt,
    resolvedAt: m.resolvedAt,
    resolvedBy: m.resolvedBy?.username ?? null,
    from: m.user
      ? { id: m.user.id, username: m.user.username, status: m.user.status }
      : m.guestSessionId
        ? 'guest'
        : 'deleted',
    canReply: m.allowReply && !!m.user,
  }));
}

/**
 * The reply address for one message, only if its sender allowed it. The caller audits
 * the viewing.
 */
export async function contactReplyEmail(id: string): Promise<string | null> {
  const m = await db.contactMessage.findUnique({
    where: { id },
    include: { user: { select: { id: true, dekWrapped: true, emailEnc: true } } },
  });
  if (!m) throw new ApiError(404, 'NOT_FOUND', 'Not found');
  if (!m.allowReply || !m.user) return null;
  try {
    return decryptUserEmail(m.user);
  } catch {
    return null; // the account was deleted and its email shredded
  }
}

export async function setContactResolved(id: string, adminId: string, resolved: boolean) {
  const res = await db.contactMessage.updateMany({
    where: { id },
    data: resolved
      ? { status: 'RESOLVED', resolvedAt: new Date(), resolvedById: adminId }
      : { status: 'OPEN', resolvedAt: null, resolvedById: null },
  });
  if (res.count !== 1) throw new ApiError(404, 'NOT_FOUND', 'Not found');
}
