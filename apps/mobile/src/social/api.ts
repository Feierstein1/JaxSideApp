import type {
  FriendActivityItem,
  FriendRequestView,
  FriendUser,
  FriendView,
  NotificationView,
} from '@jax/shared';
import { api } from '@/api';

/** D76: friends, the bell and the friends feed. None of these need a location reading. */
export const social = {
  friends: () => api.get<{ friends: FriendView[] }>('/api/v1/friends'),
  requests: () =>
    api.get<{ incoming: FriendRequestView[]; outgoing: FriendRequestView[] }>(
      '/api/v1/friends/requests',
    ),
  send: (username: string) =>
    api.post<{ state: 'requested' | 'friends' }>('/api/v1/friends/requests', { username }),
  accept: (id: string) => api.post(`/api/v1/friends/requests/${id}/accept`, {}),
  decline: (id: string) => api.post(`/api/v1/friends/requests/${id}/decline`, {}),
  cancel: (id: string) => api.delete(`/api/v1/friends/requests/${id}`),
  unfriend: (username: string) => api.delete(`/api/v1/friends/${encodeURIComponent(username)}`),
  activity: (before?: string) =>
    api.get<{ items: FriendActivityItem[]; nextBefore: string | null }>(
      `/api/v1/friends/activity${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    ),
  notifications: () => api.get<{ notifications: NotificationView[] }>('/api/v1/notifications'),
  unread: () => api.get<{ unread: number }>('/api/v1/notifications/unread'),
  markRead: () => api.post('/api/v1/notifications/read', {}),
  friendsFavorited: (placeId: string) =>
    api.get<{ friends: FriendUser[] }>(`/api/v1/places/${placeId}/friends-favorited`),
  setHidePosts: (hidePostsFromFriends: boolean) =>
    api.patch('/api/v1/me/friend-privacy', { hidePostsFromFriends }),
};
