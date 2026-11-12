import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';

/*
 * D230: what app users do with events: follow them. D233: they don't suggest events; hosts
 * add them on JaxSide for Business.
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
