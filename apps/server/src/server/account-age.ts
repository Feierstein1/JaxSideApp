import type { User } from '@/generated/prisma/client';

const DAY_MS = 86_400_000;

/**
 * D162: JaxSide staff (portal admins, and accounts given the ADMIN badge) skip every
 * new-account waiting period: voting on places and polls, rating places, starting topics and
 * chats. Both are set only by an admin, never by the account itself.
 */
export const isStaff = (u: Pick<User, 'role' | 'staffBadge'>) => u.role === 'ADMIN' || u.staffBadge;

/** D268: review accounts skip the waits too (a reviewer has minutes, not days). */
export const skipsAccountWaits = (u: Pick<User, 'role' | 'staffBadge' | 'reviewAccount'>) =>
  isStaff(u) || u.reviewAccount;

/** Is this account past a `days`-long new-account wait (or staff / review)? */
export function pastAccountWait(
  u: Pick<User, 'role' | 'staffBadge' | 'reviewAccount' | 'createdAt'>,
  days: number,
  now = new Date(),
) {
  return skipsAccountWaits(u) || now.getTime() - u.createdAt.getTime() >= days * DAY_MS;
}
