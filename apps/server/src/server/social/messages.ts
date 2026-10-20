import {
  normalizeUsername,
  UNSEND_MINUTES,
  type ChatMessage,
  type ConversationSummary,
} from '@jax/shared';
import type { Prisma, User } from '@/generated/prisma/client';
import { getConfig } from '../config';
import {
  createUserKey,
  decryptField,
  encryptField,
  unwrapUserKey,
} from '../crypto/field-encryption';
import { uuidv7 } from '../crypto/uuid';
import { db } from '../db';
import { ApiError } from '../http';
import { signedPhotoUrl } from '../media/photos';
import { screenText } from '../moderation/screening';
import { checkEdit, countLinks } from '../moderation/spam';
import { enforce } from '../rate-limit';
import { friendUser, pair } from './friends';

/**
 * D98: private messages between mutual friends (docs/MESSAGING_DESIGN.md). One conversation
 * per pair. Text is encrypted with a per-conversation key wrapped by the master key (D35),
 * so the database alone can't read chats. Every function checks that the caller is one of
 * the two people; nothing about membership is trusted from the app.
 */

const DAY_MS = 86_400_000;
const PAGE = 50;
const keyOwner = (conversationId: string) => `conversation:${conversationId}`;

function conversationKey(c: { id: string; dekWrapped: Uint8Array }) {
  return unwrapUserKey(keyOwner(c.id), c.dekWrapped);
}

const encrypt = (c: { id: string; dekWrapped: Uint8Array }, messageId: string, text: string) =>
  encryptField(keyOwner(c.id), `message:${messageId}`, conversationKey(c), text);

export function decryptBody(
  c: { id: string; dekWrapped: Uint8Array },
  m: { id: string; bodyEnc: Uint8Array | null },
  dek = conversationKey(c),
): string {
  if (!m.bodyEnc) return '';
  return decryptField(keyOwner(c.id), `message:${m.id}`, dek, m.bodyEnc);
}

const userSelect = {
  id: true,
  username: true,
  status: true,
  profileColor: true,
  profile: { select: { avatarPhotoId: true } },
} as const;

/** Friends, both active, and no block either way: the only way to send (design #1, #8). */
async function canMessage(meId: string, otherId: string): Promise<boolean> {
  const [friendship, block, other] = await Promise.all([
    db.friendship.findFirst({
      where: { ...pair(meId, otherId), status: 'ACCEPTED' },
      select: { id: true },
    }),
    db.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: meId, blockedId: otherId },
          { blockerId: otherId, blockedId: meId },
        ],
      },
      select: { blockerId: true },
    }),
    db.user.findUnique({ where: { id: otherId }, select: { status: true } }),
  ]);
  return !!friendship && !block && other?.status === 'ACTIVE';
}

/** The conversation between two people, if any (never trusts a conversation ID alone). */
async function findConversation(meId: string, otherId: string) {
  return db.conversation.findUnique({
    where: { userLowId_userHighId: pair(meId, otherId) },
  });
}

async function memberOf(conversationId: string, userId: string) {
  const m = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    include: { conversation: true },
  });
  if (!m) throw new ApiError(404, 'NOT_FOUND', 'Chat not found');
  return m;
}

async function otherUser(username: string) {
  const u = await db.user.findUnique({
    where: { usernameNormalized: normalizeUsername(username) },
    select: userSelect,
  });
  if (!u || u.status === 'DELETED' || u.status === 'BANNED') {
    throw new ApiError(404, 'NOT_FOUND', 'User not found');
  }
  return u;
}

// ───────────────────────────── Sending ─────────────────────────────

export async function sendMessage(
  user: User,
  input: { to: string; body: string; photoIds?: string[]; confirmWarning?: true },
  now = new Date(),
): Promise<ChatMessage> {
  const other = await otherUser(input.to);
  if (other.id === user.id) throw new ApiError(400, 'VALIDATION_ERROR', 'That’s you!');
  if (!(await canMessage(user.id, other.id))) {
    throw new ApiError(
      403,
      'NOT_FRIENDS',
      'You can message friends only. Send a friend request first.',
    );
  }

  let conversation = await findConversation(user.id, other.id);
  if (!conversation) {
    const minDays = await getConfig('messages.newChatMinAccountDays');
    if (now.getTime() - user.createdAt.getTime() < minDays * DAY_MS) {
      throw new ApiError(
        403,
        'ACCOUNT_TOO_NEW',
        `New accounts can start chats after ${minDays} days. You can reply to chats now.`,
      );
    }
    await enforce(
      [
        {
          key: `message-new-chat:user:${user.id}`,
          limitKey: 'rateLimit.messageNewChat.perDay',
          windowSeconds: 86_400,
        },
      ],
      now,
    );
  }

  // Same screening as posts, but nothing is held: refused, or (warnings) confirmed (#5).
  if (input.body) {
    await screenText(input.body, 'edit', input);
    await checkEdit(input.body);
    const hours = await getConfig('spam.newAccountLinkHoldHours');
    if (countLinks(input.body) && now.getTime() - user.createdAt.getTime() < hours * 3_600_000) {
      throw new ApiError(422, 'LINKS_NOT_YET', 'New accounts can’t send links yet.');
    }
  }

  return db.$transaction(async (tx) => {
    if (!conversation) {
      const id = uuidv7();
      try {
        conversation = await tx.conversation.create({
          data: {
            id,
            ...pair(user.id, other.id),
            dekWrapped: createUserKey(keyOwner(id)).wrapped,
            createdAt: now,
            lastMessageAt: now,
            members: { create: [{ userId: user.id }, { userId: other.id }] },
          },
        });
      } catch {
        // Both started a chat at the same moment: use the other one.
        conversation = await tx.conversation.findUniqueOrThrow({
          where: { userLowId_userHighId: pair(user.id, other.id) },
        });
      }
    }
    const messageId = uuidv7();
    const message = await tx.message.create({
      data: {
        id: messageId,
        conversationId: conversation.id,
        senderId: user.id,
        bodyEnc: input.body ? encrypt(conversation, messageId, input.body) : null,
        createdAt: now,
      },
    });
    const photos = await attachMessagePhotos(tx, user.id, input.photoIds ?? [], messageId);
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: now },
    });
    // Sending counts as having read the chat.
    await tx.conversationMember.update({
      where: { conversationId_userId: { conversationId: conversation.id, userId: user.id } },
      data: { lastReadAt: now },
    });
    return view(message, input.body, photos, user.id, now);
  });
}

async function attachMessagePhotos(
  tx: Prisma.TransactionClient,
  userId: string,
  photoIds: string[],
  messageId: string,
) {
  if (!photoIds.length) return [];
  const res = await tx.photo.updateMany({
    where: {
      id: { in: photoIds },
      uploaderId: userId,
      kind: 'IMAGE',
      status: 'ACTIVE',
      generalPostId: null,
      businessPostId: null,
      messageId: null,
      avatarOf: null,
    },
    data: { messageId },
  });
  if (res.count !== new Set(photoIds).size) {
    throw new ApiError(
      400,
      'INVALID_PHOTO',
      'One of the photos can’t be used. Try adding it again.',
    );
  }
  return tx.photo.findMany({
    where: { messageId },
    select: { id: true, width: true, height: true },
    orderBy: { createdAt: 'asc' },
  });
}

function view(
  m: { id: string; senderId: string; createdAt: Date },
  body: string,
  photos: { id: string; width: number | null; height: number | null }[],
  meId: string,
  now = new Date(),
): ChatMessage {
  const mine = m.senderId === meId;
  return {
    id: m.id,
    mine,
    body,
    photos: photos.map((p) => ({
      id: p.id,
      url: signedPhotoUrl(p.id),
      width: p.width ?? 0,
      height: p.height ?? 0,
    })),
    createdAt: m.createdAt.toISOString(),
    canUnsend: mine && now.getTime() - m.createdAt.getTime() < UNSEND_MINUTES * 60_000,
  };
}

// ───────────────────────────── Reading ─────────────────────────────

const visibleTo = (userId: string, hiddenBefore: Date | null): Prisma.MessageWhereInput => ({
  unsentAt: null,
  hiddenFor: { none: { userId } },
  ...(hiddenBefore ? { createdAt: { gt: hiddenBefore } } : {}),
});

/** A chat with someone, newest page (or older with `before`); marks it read. */
export async function chatWith(meId: string, username: string, before?: string) {
  const other = await otherUser(username);
  const conversation = await findConversation(meId, other.id);
  const canSend = await canMessage(meId, other.id);
  const withUser = friendUser(other);
  if (!conversation) return { with: withUser, canSend, messages: [], nextBefore: null };
  const member = await memberOf(conversation.id, meId);
  const cursor = before ? new Date(before) : null;
  if (cursor && Number.isNaN(cursor.getTime())) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid cursor');
  }
  const rows = await db.message.findMany({
    where: {
      conversationId: conversation.id,
      ...visibleTo(meId, member.hiddenBefore),
      ...(cursor ? { AND: [{ createdAt: { lt: cursor } }] } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE + 1,
    include: {
      photos: {
        where: { status: 'ACTIVE' },
        select: { id: true, width: true, height: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  const page = rows.slice(0, PAGE);
  const dek = conversationKey(conversation);
  if (!cursor) {
    await db.conversationMember.update({
      where: { conversationId_userId: { conversationId: conversation.id, userId: meId } },
      data: { lastReadAt: new Date() },
    });
  }
  return {
    with: withUser,
    canSend,
    messages: page.reverse().map((m) => view(m, decryptBody(conversation, m, dek), m.photos, meId)),
    nextBefore: rows.length > PAGE ? page[0]!.createdAt.toISOString() : null,
  };
}

/** Your chats, newest first, with a short preview and an unread flag. */
export async function listConversations(meId: string): Promise<ConversationSummary[]> {
  const members = await db.conversationMember.findMany({
    where: { userId: meId },
    include: {
      conversation: {
        include: { userLow: { select: userSelect }, userHigh: { select: userSelect } },
      },
    },
  });
  const out: ConversationSummary[] = [];
  for (const m of members) {
    const c = m.conversation;
    const last = await db.message.findFirst({
      where: { conversationId: c.id, ...visibleTo(meId, m.hiddenBefore) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { photos: { select: { id: true } } },
    });
    if (!last) continue; // empty, or deleted for me with nothing new since
    const other = c.userLowId === meId ? c.userHigh : c.userLow;
    if (other.status === 'DELETED') continue;
    const text = decryptBody(c, last);
    out.push({
      id: c.id,
      with: friendUser(other),
      preview: `${last.senderId === meId ? 'You: ' : ''}${text ? text.slice(0, 80) : 'Photo'}`,
      lastMessageAt: last.createdAt.toISOString(),
      unread: last.senderId !== meId && (!m.lastReadAt || last.createdAt > m.lastReadAt),
      canSend: await canMessage(meId, other.id),
    });
  }
  return out.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

/** Chats with a message from the other person you haven't seen (the top-bar badge). */
export async function unreadChats(meId: string): Promise<number> {
  const [row] = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "ConversationMember" cm
    WHERE cm."userId" = ${meId}::uuid AND EXISTS (
      SELECT 1 FROM "Message" m
      WHERE m."conversationId" = cm."conversationId" AND m."senderId" <> ${meId}::uuid
        AND m."unsentAt" IS NULL
        AND m."createdAt" > coalesce(cm."lastReadAt", 'epoch'::timestamptz)
        AND m."createdAt" > coalesce(cm."hiddenBefore", 'epoch'::timestamptz)
        AND NOT EXISTS (SELECT 1 FROM "MessageHide" h
                        WHERE h."messageId" = m.id AND h."userId" = ${meId}::uuid))`;
  return row?.n ?? 0;
}

// ───────────────────────────── Unsend / delete for me ─────────────────────────────

/** Your own message, within 15 minutes: gone for both (design #9). */
export async function unsendMessage(meId: string, messageId: string, now = new Date()) {
  const m = await db.message.findFirst({
    where: { id: messageId, senderId: meId, unsentAt: null },
  });
  if (!m) throw new ApiError(404, 'NOT_FOUND', 'Message not found');
  if (now.getTime() - m.createdAt.getTime() >= UNSEND_MINUTES * 60_000) {
    throw new ApiError(
      409,
      'TOO_LATE',
      `You can unsend within ${UNSEND_MINUTES} minutes. Use “Delete for me” instead.`,
    );
  }
  await db.$transaction([
    db.message.update({ where: { id: messageId }, data: { unsentAt: now, bodyEnc: null } }),
    db.photo.updateMany({
      where: { messageId },
      data: { status: 'REMOVED', removedAt: now },
    }),
  ]);
}

/** Hide one message from your own view. */
export async function hideMessage(meId: string, messageId: string) {
  const m = await db.message.findUnique({ where: { id: messageId } });
  if (!m) throw new ApiError(404, 'NOT_FOUND', 'Message not found');
  await memberOf(m.conversationId, meId);
  await db.messageHide.createMany({ data: [{ messageId, userId: meId }], skipDuplicates: true });
}

/** "Delete chat for me": everything up to now is hidden from you; new messages still come. */
export async function hideConversation(meId: string, conversationId: string, now = new Date()) {
  await memberOf(conversationId, meId);
  await db.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: meId } },
    data: { hiddenBefore: now },
  });
}

// ───────────────────────────── Reports ─────────────────────────────

/**
 * D98 / design #6: a report on a message carries a snapshot of it and the 10 messages
 * around it (5 before, 5 after), kept with the report as evidence for a year. Only someone
 * in the chat may report, and not their own message.
 */
export async function messageReportEvidence(reporterId: string, messageId: string) {
  const m = await db.message.findFirst({
    where: { id: messageId, unsentAt: null },
    include: { conversation: true },
  });
  if (!m) throw new ApiError(404, 'NOT_FOUND', 'Message not found');
  await memberOf(m.conversationId, reporterId);
  if (m.senderId === reporterId) {
    throw new ApiError(400, 'CANNOT_REPORT_OWN', 'You can’t report your own message.');
  }
  const c = m.conversation;
  const around = (dir: 'lt' | 'gt') =>
    db.message.findMany({
      where: { conversationId: c.id, unsentAt: null, createdAt: { [dir]: m.createdAt } },
      orderBy: { createdAt: dir === 'lt' ? 'desc' : 'asc' },
      take: 5,
      include: {
        sender: { select: { username: true } },
        photos: { select: { id: true } },
      },
    });
  const [before, after] = await Promise.all([around('lt'), around('gt')]);
  const self = await db.message.findUniqueOrThrow({
    where: { id: m.id },
    include: { sender: { select: { username: true } }, photos: { select: { id: true } } },
  });
  const dek = conversationKey(c);
  const snap = (x: typeof self) => ({
    id: x.id,
    sender: x.sender.username,
    body: decryptBody(c, x, dek),
    photoIds: x.photos.map((p) => p.id),
    createdAt: x.createdAt.toISOString(),
    reported: x.id === m.id,
  });
  return {
    authorUserId: m.senderId,
    evidence: {
      messageId: m.id,
      conversationId: c.id,
      messages: [...before.reverse(), self, ...after].map(snap),
    },
  };
}

/** Account deletion (design #9): every message the person sent goes. */
export async function deleteMessagesFrom(tx: Prisma.TransactionClient, userId: string) {
  await tx.photo.updateMany({
    where: { message: { senderId: userId } },
    data: { status: 'REMOVED', removedAt: new Date() },
  });
  await tx.message.deleteMany({ where: { senderId: userId } });
}

/**
 * Daily job (design #10): message evidence on reports is kept for a year. Reports whose
 * message still exists just lose the snapshot; reports that only had the snapshot go.
 */
export async function purgeOldMessageEvidence(now = new Date()) {
  const cutoff = new Date(now.getTime() - 365 * DAY_MS);
  const deleted = await db.$executeRaw`
    DELETE FROM "Report" WHERE "messageEvidence" IS NOT NULL AND "messageId" IS NULL
      AND "createdAt" < ${cutoff}`;
  const cleared = await db.$executeRaw`
    UPDATE "Report" SET "messageEvidence" = NULL
    WHERE "messageEvidence" IS NOT NULL AND "messageId" IS NOT NULL AND "createdAt" < ${cutoff}`;
  return deleted + cleared;
}
