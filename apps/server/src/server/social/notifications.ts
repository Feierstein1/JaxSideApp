import type { NotificationView } from '@jax/shared';
import type { NotificationType, Prisma } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { signedPhotoUrl } from '../media/photos';

/**
 * D76: the in-app bell. Rows are small (type + who caused it) and indexed by recipient,
 * so the unread count the app polls is one index lookup. Live updates (WebSockets) and
 * phone push can be added on top later without changing this table.
 */

const LIST_SIZE = 50;
/** D107: the bell shows what retention keeps (old ones are deleted by jobs/retention.ts). */
const windowStart = async () =>
  new Date(Date.now() - (await getConfig('retention.notificationUnreadDays')) * 86_400_000);

export async function notify(
  tx: Prisma.TransactionClient,
  userId: string,
  type: NotificationType,
  actorId: string,
) {
  await tx.notification.create({ data: { userId, type, actorId } });
}

export async function unreadCount(userId: string): Promise<number> {
  return db.notification.count({
    where: {
      userId,
      readAt: null,
      actor: { status: 'ACTIVE' },
      createdAt: { gt: await windowStart() },
    },
  });
}

export async function listNotifications(userId: string): Promise<NotificationView[]> {
  const rows = await db.notification.findMany({
    where: {
      userId,
      actor: { status: 'ACTIVE' },
      createdAt: { gt: await windowStart() },
    },
    orderBy: { createdAt: 'desc' },
    take: LIST_SIZE,
    include: {
      actor: {
        select: { id: true, username: true, profileColor: true, profile: true },
      },
    },
  });
  // Requests still waiting can be answered right from the bell.
  const pending = await db.friendship.findMany({
    where: {
      status: 'PENDING',
      requesterId: { in: rows.filter((r) => r.type === 'FRIEND_REQUEST').map((r) => r.actorId!) },
      OR: [{ userLowId: userId }, { userHighId: userId }],
    },
    select: { id: true, requesterId: true },
  });
  const pendingBy = new Map(pending.map((p) => [p.requesterId, p.id]));
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    actor: r.actor
      ? {
          username: r.actor.username,
          color: r.actor.profileColor,
          avatarUrl: r.actor.profile?.avatarPhotoId
            ? signedPhotoUrl(r.actor.profile.avatarPhotoId)
            : null,
        }
      : null,
    pendingRequestId:
      r.type === 'FRIEND_REQUEST' && r.actorId ? (pendingBy.get(r.actorId) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
    read: r.readAt !== null,
  }));
}

export async function markAllRead(userId: string) {
  await db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
