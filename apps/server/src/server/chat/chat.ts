import type { ChatLine, ChatStatus } from '@jax/shared';
import { CHAT_MAX, type LocationReading } from '@jax/shared';
import type { ChatRoom, User } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { assertLocationEligible } from '../location/eligibility';
import { screenText } from '../moderation/screening';
import { countLinks } from '../moderation/spam';
import { enforce } from '../rate-limit';
import { chatIsOpen, countPresent, notePresence } from './presence';

/**
 * D218: live area chat. Plain text only; usernames only (never pictures, email or locations);
 * the room comes from the verified location, never from the client. Lines expire after 23
 * hours and the room keeps only its newest ones, so nothing piles up.
 */

/** Under 5 people the count is vague, so a quiet room doesn't point at who is out and about. */
export const peopleLabel = (n: number) => (n < 5 ? 'a few' : String(n));

export const roomTitle = (
  r: Pick<ChatRoom, 'displayName' | 'neighborhood' | 'zip' | 'direction'>,
) =>
  r.displayName ??
  r.neighborhood ??
  (r.zip ? `${r.zip}${r.direction ? ` ${r.direction}` : ''}` : 'Your area');

const info = (r: ChatRoom) => ({ title: roomTitle(r), zip: r.zip });

/** Guests and unconfirmed accounts have no chat (D218). */
function assertCanChat(user: User) {
  if (!user.emailVerifiedAt) {
    throw new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Confirm your email to use area chat.');
  }
}

/** Where you are and whether chat is open there. Also counts you as present. */
export async function chatStatus(user: User, reading: LocationReading): Promise<ChatStatus> {
  assertCanChat(user);
  const at = await assertLocationEligible({ kind: 'user', user }, reading, 'general.read');
  const room = await notePresence(user.id, at);
  if (!(await chatIsOpen(room))) return { open: false, room: null, people: null };
  return { open: true, room: info(room), people: peopleLabel(await countPresent(room.id)) };
}

async function openRoom(user: User, reading: LocationReading) {
  assertCanChat(user);
  const at = await assertLocationEligible({ kind: 'user', user }, reading, 'general.read');
  const room = await notePresence(user.id, at);
  if (!(await chatIsOpen(room))) {
    throw new ApiError(403, 'CHAT_CLOSED', 'Area chat isn’t open here right now.');
  }
  return room;
}

/** Visible lines, oldest first. Lines by banned or suspended people are left out. */
export async function listChat(
  user: User,
  input: { reading: LocationReading; after?: string },
  now = new Date(),
): Promise<{ lines: ChatLine[]; room: ReturnType<typeof info>; people: string }> {
  const room = await openRoom(user, input.reading);
  const rows = await db.chatMessage.findMany({
    where: {
      roomId: room.id,
      expiresAt: { gt: now },
      author: { status: 'ACTIVE' },
      ...(input.after ? { createdAt: { gt: new Date(input.after) } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: await getConfig('chat.keepMaximum'),
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { username: true, role: true } },
    },
  });
  return {
    lines: rows.map((m) => ({
      id: m.id,
      username: m.author.username,
      admin: m.author.role === 'ADMIN',
      createdAt: m.createdAt.toISOString(),
      body: m.body,
    })),
    room: info(room),
    people: peopleLabel(await countPresent(room.id, now)),
  };
}

/** Same words in the same order, whatever the capitals, spacing or punctuation. */
const comparable = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Keeps the newest lines: at least `keepMinimum`, up to `keepMaximum` while under N minutes old. */
export async function trimRoom(roomId: string, now = new Date()) {
  const [min, max, busy] = await Promise.all([
    getConfig('chat.keepMinimum'),
    getConfig('chat.keepMaximum'),
    getConfig('chat.keepBusyMinutes'),
  ]);
  const older = await db.chatMessage.findMany({
    where: { roomId },
    orderBy: { createdAt: 'desc' },
    skip: min,
    take: 1000,
    select: { id: true, createdAt: true },
  });
  const cutoff = now.getTime() - busy * 60_000;
  const drop = older
    .filter((m, i) => min + i >= max || m.createdAt.getTime() < cutoff)
    .map((m) => m.id);
  if (drop.length) await db.chatMessage.deleteMany({ where: { id: { in: drop } } });
}

export async function sendChat(
  user: User,
  input: { reading: LocationReading; body: string },
  now = new Date(),
): Promise<ChatLine> {
  assertCanChat(user);
  await enforce(
    [
      {
        key: `chat-burst:user:${user.id}`,
        limitKey: 'rateLimit.chat.burstPer3s',
        windowSeconds: 3,
      },
      { key: `chat-min:user:${user.id}`, limitKey: 'rateLimit.chat.perMinute', windowSeconds: 60 },
      {
        key: `chat-hour:user:${user.id}`,
        limitKey: 'rateLimit.chat.perHour',
        windowSeconds: 3_600,
      },
    ],
    now,
  );
  const room = await openRoom(user, input.reading);
  const body = input.body.trim().slice(0, CHAT_MAX);
  // Forbidden words: the same rules as posts, but nothing is held for review in live chat.
  await screenText(body, 'edit');
  if (countLinks(body)) throw new ApiError(422, 'NO_LINKS', 'Links aren’t allowed in area chat.');
  const mine = await db.chatMessage.findMany({
    where: {
      roomId: room.id,
      authorId: user.id,
      createdAt: { gt: new Date(now.getTime() - 600_000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { body: true },
  });
  if (mine.some((m) => comparable(m.body) === comparable(body))) {
    throw new ApiError(422, 'DUPLICATE_MESSAGE', 'You just said that. Try something new.');
  }
  const hours = await getConfig('chat.expireHours');
  const row = await db.chatMessage.create({
    data: {
      roomId: room.id,
      authorId: user.id,
      body,
      createdAt: now,
      expiresAt: new Date(now.getTime() + hours * 3_600_000),
    },
  });
  await db.chatRoom.update({ where: { id: room.id }, data: { lastActivityAt: now } });
  await trimRoom(room.id, now);
  return {
    id: row.id,
    username: user.username,
    admin: user.role === 'ADMIN',
    createdAt: row.createdAt.toISOString(),
    body: row.body,
  };
}

/** Deletes lines an hour after they expired, and rooms idle for 7 days with nobody present. */
export async function purgeChat(now = new Date()) {
  const lines = await db.chatMessage.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - 3_600_000) } },
  });
  const rooms = await db.chatRoom.deleteMany({
    where: {
      lastActivityAt: { lt: new Date(now.getTime() - 7 * 86_400_000) },
      presence: { none: {} },
    },
  });
  return { lines: lines.count, rooms: rooms.count };
}
