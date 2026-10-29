import type { User } from '@/generated/prisma/client';

const DAY_MS = 86_400_000;

/**
 * D162: JaxSide staff (portal admins, and accounts given the ADMIN badge) skip every
 * new-account waiting period: voting on places and polls, rating places, starting topics and
 * chats. Both are set only by an admin, never by the account itself.
 */
export const skipsAccountWaits = (u: Pick<User, 'role' | 'staffBadge'>) =>
  u.role === 'ADMIN' || u.staffBadge;

/** Is this account past a `days`-long new-account wait (or staff)? */
export function pastAccountWait(
  u: Pick<User, 'role' | 'staffBadge' | 'createdAt'>,
  days: number,
  now = new Date(),
) {
  return skipsAccountWaits(u) || now.getTime() - u.createdAt.getTime() >= days * DAY_MS;
}
