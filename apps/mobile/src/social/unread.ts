import { clearNotificationBadge, refreshBadges, useBadge } from './badges';

/** D76: the bell's unread count (polled together with Messages, Q26). */
export const refreshUnread = refreshBadges;
export const clearUnread = clearNotificationBadge;
export const useUnreadCount = (enabled: boolean) => useBadge('notifications', enabled);
