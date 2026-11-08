import type { ChatLine, ChatStatus } from '@jax/shared';
import { CHAT_MAX, type LocationReading } from '@jax/shared';
import type { ChatRoom, User } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { assertLocationEligible } from '../location/eligibility';
import { screenText } from '../moderation/screening';
import { assertNoLinks } from '../moderation/spam';
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

/** D141 / D155: staff are people with the staff badge, or admins; their lines show in the staff color. */
export const isStaff = (u: { role: string; staffBadge: boolean }) =>
  u.staffBadge || u.role === 'ADMIN';

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
  const mutedUntil = (await activeMute(user.id))?.toISOString() ?? null;
  if (!(await chatIsOpen(room))) return { open: false, mutedUntil, room: null, people: null };
  return {
    open: true,
    mutedUntil,
    room: info(room),
    people: peopleLabel(await countPresent(room.id)),
  };
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
): Promise<{
  lines: ChatLine[];
  room: ReturnType<typeof info>;
  people: string;
  mutedUntil: string | null;
}> {
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
      author: { select: { username: true, role: true, staffBadge: true } },
    },
  });
  return {
    lines: rows.map((m) => ({
      id: m.id,
      username: m.author.username,
      admin: isStaff(m.author),
      createdAt: m.createdAt.toISOString(),
      body: m.body,
    })),
    room: info(room),
    people: peopleLabel(await countPresent(room.id, now)),
    mutedUntil: (await activeMute(user.id, now))?.toISOString() ?? null,
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

/** Until when this person is muted, or null. */
async function activeMute(userId: string, now = new Date()) {
  const m = await db.chatMute.findUnique({ where: { userId } });
  return m && m.until > now ? m.until : null;
}

const MINUTE = 60_000;
/** Rule-breaking in the last 24 hours: 1-2 a warning, then 10 minutes, 1 hour, the rest of the day. */
const MUTE_AFTER = [10 * MINUTE, 60 * MINUTE, 24 * 60 * MINUTE];

/**
 * D218: records a broken chat rule and answers with a warning, or, from the third in a day,
 * a timed mute (10 minutes, then an hour, then the rest of the day). Never returns.
 */
async function violation(userId: string, kind: string, err: ApiError, now: Date): Promise<never> {
  await db.chatOffense.create({ data: { userId, kind, createdAt: now } });
  const count = await db.chatOffense.count({
    where: { userId, createdAt: { gt: new Date(now.getTime() - 24 * 60 * MINUTE) } },
  });
  if (count < 3) {
    throw new ApiError(
      err.status,
      err.code,
      `${err.message} Warning ${count} of 2: keep breaking the chat rules and you’ll be muted.`,
      { ...(typeof err.details === 'object' && err.details ? err.details : {}), warning: count },
    );
  }
  const until = new Date(now.getTime() + MUTE_AFTER[Math.min(count - 3, MUTE_AFTER.length - 1)]!);
  await db.chatMute.upsert({
    where: { userId },
    create: { userId, until },
    update: { until },
  });
  throw mutedError(until, now);
}

function mutedError(until: Date, now: Date) {
  return new ApiError(
    403,
    'CHAT_MUTED',
    'You’re muted in area chat for breaking the chat rules. You can still read it.',
    {
      mutedUntil: until.toISOString(),
      retryAfterSeconds: Math.ceil((until.getTime() - now.getTime()) / 1000),
    },
  );
}

const COUNTED: Record<string, string> = {
  CONTENT_BLOCKED: 'WORD',
  CONTENT_WARNING: 'WORD',
  NO_LINKS: 'LINK',
  DUPLICATE_MESSAGE: 'REPEAT',
};

export async function sendChat(
  user: User,
  input: { reading: LocationReading; body: string },
  now = new Date(),
): Promise<ChatLine> {
  assertCanChat(user);
  const mute = await activeMute(user.id, now);
  if (mute) throw mutedError(mute, now);
  // Two quick taps are not rule-breaking: only the minute and hour caps count against you.
  await enforce(
    [
      {
        key: `chat-burst:user:${user.id}`,
        limitKey: 'rateLimit.chat.burstPer3s',
        windowSeconds: 3,
      },
    ],
    now,
  );
  try {
    await enforce(
      [
        {
          key: `chat-min:user:${user.id}`,
          limitKey: 'rateLimit.chat.perMinute',
          windowSeconds: 60,
        },
        {
          key: `chat-hour:user:${user.id}`,
          limitKey: 'rateLimit.chat.perHour',
          windowSeconds: 3_600,
        },
      ],
      now,
    );
  } catch (e) {
    if (e instanceof ApiError && e.code === 'RATE_LIMITED') {
      return violation(user.id, 'FLOOD', e, now);
    }
    throw e;
  }
  const room = await openRoom(user, input.reading);
  const body = input.body.trim().slice(0, CHAT_MAX);
  try {
    // Forbidden words: the same rules as posts, but nothing is held for review in live chat.
    await screenText(body, 'edit');
    assertNoLinks(body);
    const mine = await db.chatMessage.findMany({
      where: {
        roomId: room.id,
        authorId: user.id,
        createdAt: { gt: new Date(now.getTime() - 10 * MINUTE) },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { body: true },
    });
    if (mine.some((m) => comparable(m.body) === comparable(body))) {
      throw new ApiError(422, 'DUPLICATE_MESSAGE', 'You just said that. Try something new.');
    }
  } catch (e) {
    if (e instanceof ApiError && COUNTED[e.code])
      return violation(user.id, COUNTED[e.code]!, e, now);
    throw e;
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
    admin: isStaff(user),
    createdAt: row.createdAt.toISOString(),
    body: row.body,
  };
}

/**
 * D218: "Report messages" on a name in the chat. The reporter must be in the same room; the
 * report keeps a copy of that person's last 20 lines there, because the chat itself is gone
 * after 24 hours.
 */
export async function chatReportEvidence(reporterId: string, username: string, now = new Date()) {
  const notFound = () => new ApiError(404, 'NOT_FOUND', 'Not found');
  const mine = await db.chatPresence.findUnique({
    where: { userId: reporterId },
    select: { room: true },
  });
  const person = await db.user.findUnique({
    where: { usernameNormalized: username.toLowerCase() },
    select: { id: true },
  });
  if (!mine || !person) throw notFound();
  const lines = await db.chatMessage.findMany({
    where: { roomId: mine.room.id, authorId: person.id, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { body: true, createdAt: true },
  });
  if (!lines.length) throw notFound();
  return {
    authorId: person.id,
    evidence: {
      room: roomTitle(mine.room),
      roomId: mine.room.id,
      lines: lines.reverse().map((l) => ({ at: l.createdAt.toISOString(), body: l.body })),
    },
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
  await db.chatOffense.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 86_400_000) } },
  });
  await db.chatMute.deleteMany({ where: { until: { lt: now } } });
  // D218: chat copied into a report is kept a year, like message evidence.
  await db.$executeRaw`UPDATE "Report" SET "chatEvidence" = NULL
    WHERE "chatEvidence" IS NOT NULL AND "createdAt" < ${new Date(now.getTime() - 365 * 86_400_000)}`;
  return { lines: lines.count, rooms: rooms.count };
}
