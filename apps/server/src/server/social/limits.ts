import { enforce } from '../rate-limit';

/** D76: one per-minute budget for friend and bell actions (requests have their own). */
export const socialLimit = (userId: string) =>
  enforce([
    { key: `friends:user:${userId}`, limitKey: 'rateLimit.friends.perMinute', windowSeconds: 60 },
  ]);

export const notificationLimit = (userId: string) =>
  enforce([
    {
      key: `notifications:user:${userId}`,
      limitKey: 'rateLimit.notifications.perMinute',
      windowSeconds: 60,
    },
  ]);
