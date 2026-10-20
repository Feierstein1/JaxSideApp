import { enforce } from '../rate-limit';

/** D98: reading chats and the unread badge (a chat checks every 3 s while open). */
export const messageReadLimit = (userId: string) =>
  enforce([
    {
      key: `message-read:user:${userId}`,
      limitKey: 'rateLimit.messageRead.perMinute',
      windowSeconds: 60,
    },
  ]);
