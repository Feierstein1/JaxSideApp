import { refreshBadges, useBadge } from './badges';

/** D98: the Messages badge (chats with something unseen; polled with the bell, Q26). */
export const refreshUnreadMessages = refreshBadges;
export const useUnreadMessages = (enabled: boolean) => useBadge('messages', enabled);
