import {
  CHAT_MAX,
  hasAlarmPhrase,
  type ChatLine,
  type EventChatList,
  type EventChatStatus,
  type LocationReading,
} from '@jax/shared';
import type { User } from '@/generated/prisma/client';
import {
  activeMute,
  chatSendLimits,
  comparable,
  COUNTED,
  isStaff,
  peopleLabel,
  violation,
} from '../chat/chat';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { assertLocationEligible } from '../location/eligibility';
import { screenText } from '../moderation/screening';
import { assertNoLinks } from '../moderation/spam';

/*
 * D230: event chat. One room per session, open from `events.chatOpensBeforeMinutes` before it
 * starts to `events.chatClosesAfterMinutes` after it ends, only for confirmed accounts inside
 * the event area (a circle of `chatRadiusMeters` around the pin). The server checks the
 * location on every read and every line; the app never picks the room. "Yes, I'm here" is
 * kept only until 24 hours after the session (counts only after that). The rest of the rules
 * are area chat's (D218): 200 characters, word screening, no links, no repeats, warnings and
 * mutes; plus alarming phrases are refused so a false alarm can't spread through a crowd.
 */

const MINUTE = 60_000;

async function chatWindow() {
  const [before, after] = await Promise.all([
    getConfig('events.chatOpensBeforeMinutes'),
    getConfig('events.chatClosesAfterMinutes'),
  ]);
  return { before: before * MINUTE, after: after * MINUTE };
}

/**
 * The session whose chat is open now (or the next one to open, for "opens at"), with the
 * event's pin and radius. 404 for events people can't see; cancelled events have no chat.
 */
async function currentSession(eventId: string, now: Date) {
  const e = await db.event.findFirst({
    where: { id: eventId, status: 'APPROVED' },
    select: { id: true, latitude: true, longitude: true, chatRadiusMeters: true },
  });
  if (!e || e.latitude === null || e.longitude === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Event not found');
  }
  const w = await chatWindow();
  const s = await db.eventSession.findFirst({
    where: { eventId, endsAt: { gt: new Date(now.getTime() - w.after) } },
    orderBy: { startsAt: 'asc' },
  });
  if (!s) return { event: e, session: null, open: false, opensAt: null, closesAt: null };
  const opensAt = new Date(s.startsAt.getTime() - w.before);
  const closesAt = new Date(s.endsAt.getTime() + w.after);
  return { event: e, session: s, open: opensAt <= now && now < closesAt, opensAt, closesAt };
}

/** Is the (already eligibility-checked) point inside the event area? */
async function insideArea(
  e: { latitude: number | null; longitude: number | null; chatRadiusMeters: number },
  at: { latitude: number; longitude: number },
) {
  const [row] = await db.$queryRaw<{ inside: boolean }[]>`
    SELECT ST_DWithin(
      ST_SetSRID(ST_MakePoint(${e.longitude}, ${e.latitude}), 4326)::geography,
      ST_SetSRID(ST_MakePoint(${at.longitude}, ${at.latitude}), 4326)::geography,
      ${e.chatRadiusMeters}) AS inside`;
  return !!row?.inside;
}

function assertCanChat(user: User) {
  if (!user.emailVerifiedAt) {
    throw new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Confirm your email to use event chat.');
  }
}

const peopleIn = async (sessionId: string) =>
  peopleLabel(await db.eventAttendance.count({ where: { sessionId } }));

/** Where you stand with the event's chat (for the event page's card). Reads only. */
export async function eventChatStatus(
  user: User,
  eventId: string,
  reading: LocationReading,
  now = new Date(),
): Promise<EventChatStatus> {
  const at = await assertLocationEligible({ kind: 'user', user }, reading, 'general.read');
  const c = await currentSession(eventId, now);
  const base = {
    sessionId: c.session?.id ?? null,
    opensAt: c.opensAt?.toISOString() ?? null,
    closesAt: c.closesAt?.toISOString() ?? null,
    mutedUntil: (await activeMute(user.id, now))?.toISOString() ?? null,
  };
  if (!c.open || !c.session || !user.emailVerifiedAt) {
    return { ...base, state: 'closed', people: null };
  }
  const people = await peopleIn(c.session.id);
  if (!(await insideArea(c.event, at))) return { ...base, state: 'away', people };
  const joined = await db.eventAttendance.findUnique({
    where: { userId_sessionId: { userId: user.id, sessionId: c.session.id } },
  });
  return { ...base, state: joined ? 'joined' : 'ask', people };
}

/**
 * The open session, after checking the person is allowed in: a confirmed account, inside the
 * event area now, and (unless joining) already said they're there.
 */
async function enter(
  user: User,
  eventId: string,
  reading: LocationReading,
  opts: { write: boolean; joining?: boolean },
  now: Date,
) {
  assertCanChat(user);
  const at = await assertLocationEligible(
    { kind: 'user', user },
    reading,
    opts.write ? 'general.post' : 'general.read',
  );
  const c = await currentSession(eventId, now);
  if (!c.open || !c.session) {
    throw new ApiError(403, 'CHAT_CLOSED', 'This event’s chat isn’t open right now.');
  }
  if (!(await insideArea(c.event, at))) {
    throw new ApiError(
      403,
      'NOT_AT_EVENT',
      'Event chat is for people at the event. Head over to join in.',
    );
  }
  if (!opts.joining) {
    const joined = await db.eventAttendance.findUnique({
      where: { userId_sessionId: { userId: user.id, sessionId: c.session.id } },
    });
    if (!joined) throw new ApiError(403, 'NOT_JOINED', 'Tap “Yes, I’m here” first.');
  }
  return { session: c.session, closesAt: c.closesAt! };
}

/** "Yes, I'm here": lets the person into this session's chat. */
export async function joinEventChat(
  user: User,
  eventId: string,
  reading: LocationReading,
  now = new Date(),
) {
  const { session } = await enter(user, eventId, reading, { write: true, joining: true }, now);
  await db.eventAttendance.createMany({
    data: [{ userId: user.id, sessionId: session.id, createdAt: now }],
    skipDuplicates: true,
  });
  return { joined: true, people: await peopleIn(session.id) };
}

/** Lines newer than `after` (all of them without it), and the organizer's pinned updates. */
export async function listEventChat(
  user: User,
  eventId: string,
  input: { reading: LocationReading; after?: string },
  now = new Date(),
): Promise<EventChatList> {
  const { session, closesAt } = await enter(user, eventId, input.reading, { write: false }, now);
  const rows = await db.eventChatMessage.findMany({
    where: {
      sessionId: session.id,
      expiresAt: { gt: now },
      ...(input.after ? { createdAt: { gt: new Date(input.after) } } : {}),
      OR: [
        { author: { status: 'ACTIVE' } },
        {
          businessAccountId: { not: null },
          businessAccount: { revokedAt: null, suspendedAt: null },
        },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: await getConfig('chat.keepMaximum'),
    select: {
      id: true,
      body: true,
      createdAt: true,
      businessAccountId: true,
      author: { select: { username: true, role: true, staffBadge: true } },
    },
  });
  const lines: ChatLine[] = [];
  const updates: EventChatList['updates'] = [];
  for (const m of rows) {
    if (m.businessAccountId) {
      updates.push({ id: m.id, body: m.body, createdAt: m.createdAt.toISOString() });
    } else if (m.author) {
      lines.push({
        id: m.id,
        username: m.author.username,
        admin: isStaff(m.author),
        createdAt: m.createdAt.toISOString(),
        body: m.body,
      });
    }
  }
  return {
    lines,
    updates,
    people: await peopleIn(session.id),
    mutedUntil: (await activeMute(user.id, now))?.toISOString() ?? null,
    closesAt: closesAt.toISOString(),
  };
}

export async function sendEventChat(
  user: User,
  eventId: string,
  input: { reading: LocationReading; body: string },
  now = new Date(),
): Promise<ChatLine> {
  assertCanChat(user);
  await chatSendLimits(user.id, now);
  const { session } = await enter(user, eventId, input.reading, { write: true }, now);
  const body = input.body.trim().slice(0, CHAT_MAX);
  // Not counted as rule-breaking: the person may be reporting something real.
  if (hasAlarmPhrase(body)) {
    throw new ApiError(
      422,
      'EVENT_CHAT_ALARM',
      'If this is an emergency, call 911 now. Emergency posts aren’t allowed in event chat, so rumors can’t spread through the crowd.',
    );
  }
  try {
    await screenText(body, 'edit');
    assertNoLinks(body);
    const mine = await db.eventChatMessage.findMany({
      where: {
        sessionId: session.id,
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
    if (e instanceof ApiError && COUNTED[e.code]) {
      return violation(user.id, COUNTED[e.code]!, e, now);
    }
    throw e;
  }
  const hours = await getConfig('chat.expireHours');
  const row = await db.eventChatMessage.create({
    data: {
      sessionId: session.id,
      authorId: user.id,
      body,
      createdAt: now,
      expiresAt: new Date(now.getTime() + hours * 3_600_000),
    },
  });
  await trimSession(session.id, now);
  return {
    id: row.id,
    username: user.username,
    admin: isStaff(user),
    createdAt: row.createdAt.toISOString(),
    body: row.body,
  };
}

/** Keeps the newest people's lines like area chat (organizer updates are never trimmed). */
async function trimSession(sessionId: string, now: Date) {
  const [min, max, busy] = await Promise.all([
    getConfig('chat.keepMinimum'),
    getConfig('chat.keepMaximum'),
    getConfig('chat.keepBusyMinutes'),
  ]);
  const older = await db.eventChatMessage.findMany({
    where: { sessionId, authorId: { not: null } },
    orderBy: { createdAt: 'desc' },
    skip: min,
    take: 1000,
    select: { id: true, createdAt: true },
  });
  const cutoff = now.getTime() - busy * MINUTE;
  const drop = older
    .filter((m, i) => min + i >= max || m.createdAt.getTime() < cutoff)
    .map((m) => m.id);
  if (drop.length) await db.eventChatMessage.deleteMany({ where: { id: { in: drop } } });
}

/**
 * D230: "Report chat rule-breaking" on a name in an event's chat. The reporter must have
 * joined the same session; the report keeps a copy of that person's last 20 lines there.
 */
export async function eventChatReportEvidence(
  reporterId: string,
  eventId: string,
  username: string,
  now = new Date(),
) {
  const notFound = () => new ApiError(404, 'NOT_FOUND', 'Not found');
  const joined = await db.eventAttendance.findFirst({
    where: { userId: reporterId, session: { eventId } },
    orderBy: { createdAt: 'desc' },
    select: { session: { select: { id: true, event: { select: { title: true } } } } },
  });
  const person = await db.user.findUnique({
    where: { usernameNormalized: username.toLowerCase() },
    select: { id: true },
  });
  if (!joined || !person) throw notFound();
  const lines = await db.eventChatMessage.findMany({
    where: { sessionId: joined.session.id, authorId: person.id, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { body: true, createdAt: true },
  });
  if (!lines.length) throw notFound();
  return {
    authorId: person.id,
    evidence: {
      room: `Event: ${joined.session.event.title}`,
      eventSessionId: joined.session.id,
      lines: lines.reverse().map((l) => ({ at: l.createdAt.toISOString(), body: l.body })),
    },
  };
}

/** Nightly: expired lines, and "I'm here" answers 24 hours after their session ended. */
export async function purgeEventChat(now = new Date()) {
  const lines = await db.eventChatMessage.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - 3_600_000) } },
  });
  const attendance = await db.eventAttendance.deleteMany({
    where: { session: { endsAt: { lt: new Date(now.getTime() - 24 * 3_600_000) } } },
  });
  return { lines: lines.count, attendance: attendance.count };
}
