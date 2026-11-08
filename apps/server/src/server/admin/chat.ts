import { ApiError } from '../http';
import { db } from '../db';
import { roomTitle } from '../chat/chat';
import { PRESENT_WITHIN_MS } from '../chat/presence';
import { pageWindow, toPage } from './paging';

/**
 * D218: the admin's view of live area chat. Rooms are listed busiest first, with who is present
 * now and how many lines are kept; a room's page shows the lines as people see them (plus
 * who wrote each), so a report can be checked in context. Switching a room on or off is the
 * pilot control: every room starts off.
 */
export async function adminChatRooms(page = 1, now = new Date()) {
  const { skip, take } = pageWindow(page);
  const since = new Date(now.getTime() - PRESENT_WITHIN_MS);
  const [rooms, total] = await Promise.all([
    db.chatRoom.findMany({
      orderBy: [{ enabled: 'desc' }, { lastActivityAt: 'desc' }, { id: 'asc' }],
      skip,
      take,
      include: { _count: { select: { messages: true } } },
    }),
    db.chatRoom.count(),
  ]);
  const present = await db.chatPresence.groupBy({
    by: ['roomId'],
    where: { roomId: { in: rooms.map((r) => r.id) }, lastSeenAt: { gte: since } },
    _count: { _all: true },
  });
  const here = new Map(present.map((p) => [p.roomId, p._count._all]));
  return toPage(
    rooms.map((r) => ({
      id: r.id,
      title: roomTitle(r),
      zip: r.zip,
      cellKey: r.cellKey,
      enabled: r.enabled,
      displayName: r.displayName,
      present: here.get(r.id) ?? 0,
      lines: r._count.messages,
      lastActivityAt: r.lastActivityAt,
    })),
    total,
    page,
  );
}

/** One room with its kept lines, oldest first (expired ones are not shown). */
export async function adminChatRoom(id: string, now = new Date()) {
  const room = await db.chatRoom.findUnique({ where: { id } });
  if (!room) throw new ApiError(404, 'NOT_FOUND', 'No such room.');
  const [lines, present] = await Promise.all([
    db.chatMessage.findMany({
      where: { roomId: id, expiresAt: { gt: now } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: {
          select: { id: true, username: true, role: true, staffBadge: true, status: true },
        },
      },
    }),
    db.chatPresence.count({
      where: { roomId: id, lastSeenAt: { gte: new Date(now.getTime() - PRESENT_WITHIN_MS) } },
    }),
  ]);
  const mutes = await db.chatMute.findMany({
    where: { userId: { in: [...new Set(lines.map((l) => l.author.id))] }, until: { gt: now } },
    select: { userId: true },
  });
  return {
    room: { ...room, title: roomTitle(room) },
    lines,
    present,
    mutedIds: new Set(mutes.map((m) => m.userId)),
  };
}

/** Lifts a chat mute early (their offences stay counted for the 24 hours). */
export async function adminUnmuteChatUser(userId: string) {
  await db.chatMute.deleteMany({ where: { userId } });
}

export async function adminSetChatRoom(
  id: string,
  input: { action: 'enable' | 'disable' } | { action: 'rename'; displayName: string },
) {
  const data =
    input.action === 'rename'
      ? { displayName: input.displayName || null }
      : { enabled: input.action === 'enable' };
  try {
    await db.chatRoom.update({ where: { id }, data });
  } catch {
    throw new ApiError(404, 'NOT_FOUND', 'No such room.');
  }
}
