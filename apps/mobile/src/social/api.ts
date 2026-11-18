import type {
  FriendActivityItem,
  FriendRequestView,
  FriendUser,
  FriendView,
  GiveawayWinView,
  NotificationView,
} from '@jax/shared';
import { api } from '@/api';
import { cached, invalidate, MINUTE } from '@/cache';

/** D76: friends, the bell and the friends feed. None of these need a location reading. */
/**
 * D259: the friends list and the requests are kept a short while (see `@/cache`). Any change
 * of your own clears them, and so does a new notification (a friend request or acceptance
 * arrives as one; see `badges.ts`).
 */
const changed = <T>(p: Promise<T>) => p.finally(() => invalidate('friends:'));

export const social = {
  friends: (force = false) =>
    cached(
      'friends:list',
      3 * MINUTE,
      () => api.get<{ friends: FriendView[] }>('/api/v1/friends'),
      force,
    ),
  requests: (force = false) =>
    cached(
      'friends:requests',
      MINUTE,
      () =>
        api.get<{ incoming: FriendRequestView[]; outgoing: FriendRequestView[] }>(
          '/api/v1/friends/requests',
        ),
      force,
    ),
  send: (username: string) =>
    changed(api.post<{ state: 'requested' | 'friends' }>('/api/v1/friends/requests', { username })),
  accept: (id: string) => changed(api.post(`/api/v1/friends/requests/${id}/accept`, {})),
  decline: (id: string) => changed(api.post(`/api/v1/friends/requests/${id}/decline`, {})),
  cancel: (id: string) => changed(api.delete(`/api/v1/friends/requests/${id}`)),
  unfriend: (username: string) =>
    changed(api.delete(`/api/v1/friends/${encodeURIComponent(username)}`)),
  activity: (before?: string, q?: string) => {
    const params = new URLSearchParams();
    if (before) params.set('before', before);
    if (q) params.set('q', q); // D89: search by friend username
    const qs = params.toString();
    return api.get<{ items: FriendActivityItem[]; nextBefore: string | null }>(
      `/api/v1/friends/activity${qs ? `?${qs}` : ''}`,
    );
  },
  notifications: () => api.get<{ notifications: NotificationView[] }>('/api/v1/notifications'),
  markRead: () => api.post('/api/v1/notifications/read', {}),
  /** D188: your giveaway wins, and accepting or declining one. */
  wins: () => api.get<{ wins: GiveawayWinView[] }>('/api/v1/me/giveaways'),
  answerWin: (id: string, accept: boolean) => api.post(`/api/v1/me/giveaways/${id}`, { accept }),
  friendsFavorited: (placeId: string) =>
    api.get<{ friends: FriendUser[] }>(`/api/v1/places/${placeId}/friends-favorited`),
  setHidePosts: (hidePostsFromFriends: boolean) =>
    api.patch('/api/v1/me/friend-privacy', { hidePostsFromFriends }),
};
