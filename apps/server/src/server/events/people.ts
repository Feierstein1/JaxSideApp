import { APP_TIME_ZONE, type MyEventSuggestion, type SuggestEventRequest } from '@jax/shared';
import type { User } from '@/generated/prisma/client';
import { skipsAccountWaits } from '../account-age';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { screenText } from '../moderation/screening';
import { syncSessions } from './save';

/*
 * D230: what app users do with events: follow them, and suggest ones that are missing.
 */

/** Follow or unfollow (idempotent). Only events people can see; a cancelled one can be unfollowed. */
export async function setEventFollow(userId: string, eventId: string, follow: boolean) {
  const e = await db.event.findFirst({
    where: { id: eventId, status: follow ? 'APPROVED' : { in: ['APPROVED', 'CANCELLED'] } },
    select: { id: true },
  });
  if (!e) throw new ApiError(404, 'NOT_FOUND', 'Event not found');
  if (follow) {
    await db.eventFollow.createMany({ data: [{ userId, eventId }], skipDuplicates: true });
  } else {
    await db.eventFollow.deleteMany({ where: { userId, eventId } });
  }
  const [count, min] = await Promise.all([
    db.eventFollow.count({ where: { eventId } }),
    getConfig('events.followerCountMin'),
  ]);
  return { following: follow, followerCount: count >= min ? count : null };
}

/**
 * D230: an app user suggests an event. It waits for JaxSide (who sets its pin from "where"),
 * is screened like a post, and needs an account `events.suggestMinAccountDays` old (staff
 * excepted). Returns the suggestion's ID.
 */
export async function suggestEvent(
  user: Pick<User, 'id' | 'role' | 'staffBadge' | 'createdAt'>,
  input: Omit<SuggestEventRequest, 'reading'>,
  now = new Date(),
) {
  if (!skipsAccountWaits(user)) {
    const days = await getConfig('events.suggestMinAccountDays');
    const allowedAt = new Date(user.createdAt.getTime() + days * 86_400_000);
    if (now < allowedAt) {
      const when = allowedAt.toLocaleDateString('en-US', {
        timeZone: APP_TIME_ZONE,
        month: 'short',
        day: 'numeric',
      });
      throw new ApiError(
        403,
        'ACCOUNT_TOO_NEW',
        `New accounts can suggest events after ${days} days (from ${when}).`,
      );
    }
  }
  // A blocked word refuses it; a held one is fine (every suggestion is reviewed anyway).
  await screenText(`${input.title}\n${input.description}\n${input.where}`, 'new-content');
  return db.$transaction(async (tx) => {
    const e = await tx.event.create({
      data: {
        status: 'SUGGESTED',
        hostKind: 'COMMUNITY',
        title: input.title,
        description: input.description,
        category: input.category,
        setting:
          input.setting === 'indoor' ? 'INDOOR' : input.setting === 'mixed' ? 'MIXED' : 'OUTDOOR',
        free: input.free,
        address: input.where,
        createdById: user.id,
        submittedAt: now,
      },
    });
    await syncSessions(tx, e.id, input.sessions);
    return e.id;
  });
}

/** Your suggestions, newest first, with what happened to each. */
export async function myEventSuggestions(userId: string): Promise<MyEventSuggestion[]> {
  const rows = await db.event.findMany({
    where: { createdById: userId, createdBy: { role: { not: 'ADMIN' } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, title: true, status: true, decisionReason: true, createdAt: true },
  });
  return rows.map((e) => ({
    id: e.id,
    title: e.title,
    status:
      e.status === 'SUGGESTED' || e.status === 'IN_REVIEW'
        ? 'waiting'
        : e.status === 'DENIED' || e.status === 'REMOVED'
          ? 'denied'
          : 'approved',
    reason: e.status === 'DENIED' ? e.decisionReason : null,
    createdAt: e.createdAt.toISOString(),
  }));
}
