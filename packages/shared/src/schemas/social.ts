import { z } from 'zod';

/**
 * D76: friends and notifications. Friendships are mutual and by request; everything here
 * is private to the two people involved.
 */

/** Looked up as typed (case doesn't matter); not the sign-up rules. */
export const friendRequestSchema = z.strictObject({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{3,20}$/, 'Not a username'),
});
export const markNotificationsReadSchema = z.strictObject({});
/** D76: "Hide my recent posts from friends". */
export const friendPrivacySchema = z.strictObject({ hidePostsFromFriends: z.boolean() });

/** Your relationship with someone, as their profile shows it. */
export type FriendshipState = 'none' | 'requested' | 'incoming' | 'friends';

export interface FriendUser {
  username: string;
  color: string;
  avatarUrl: string | null;
}

export interface FriendView extends FriendUser {
  since: string;
}

export interface FriendRequestView {
  id: string;
  user: FriendUser;
  createdAt: string;
}

export interface NotificationView {
  id: string;
  type: 'FRIEND_REQUEST' | 'FRIEND_ACCEPTED';
  actor: FriendUser | null;
  /** FRIEND_REQUEST still waiting: its request ID, so it can be answered from the bell. */
  pendingRequestId: string | null;
  createdAt: string;
  read: boolean;
}

/** "@name posted near Avondale" / "@name posted at Bold Bean". No text, no coordinates. */
export interface FriendActivityItem {
  id: string;
  kind: 'general' | 'business';
  author: FriendUser;
  /** Area posts: the closest neighborhood to where it was posted (null if none). */
  area: string | null;
  /** Place posts: the place. */
  place: { id: string; name: string } | null;
  createdAt: string;
}
