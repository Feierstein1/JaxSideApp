import { z } from 'zod';
import { locationReadingSchema } from './location';

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
/** D116: leave me out of the anonymous area statistics. */
export const areaStatsPreferenceSchema = z.strictObject({ optOut: z.boolean() });

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
  /** D156: POST_COMMENT, COMMENT_REPLY and MENTION point to a post (and comment). */
  type: 'FRIEND_REQUEST' | 'FRIEND_ACCEPTED' | 'POST_COMMENT' | 'COMMENT_REPLY' | 'MENTION';
  actor: FriendUser | null;
  /** FRIEND_REQUEST still waiting: its request ID, so it can be answered from the bell. */
  pendingRequestId: string | null;
  /**
   * D156: what to open. Never the text: the post or comment only shows when you open it,
   * and its comments only when you're in the area (the usual reading rule).
   */
  target: { kind: 'general' | 'business'; postId: string; commentId: string | null } | null;
  /** D156: where it is ("Riverside", a place's name), for "…near Riverside". */
  where: string | null;
  /** D156: unread comments on one post are combined ("5 new comments on your post"). */
  count: number;
  /** D157: it was the place's owner team ("The Owner"); `actor` is null then. */
  actorIsOwner: boolean;
  createdAt: string;
  read: boolean;
}

/** D156: at most this many @mentions in one post or comment notify anyone. */
export const MENTION_NOTIFY_MAX = 3;

/** D156: the distinct @usernames written in a text (lower case), in order of appearance. */
export function mentionedUsernames(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(^|[^A-Za-z0-9_@])@([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])/g)) {
    const name = m[2]!.toLowerCase();
    if (!out.includes(name)) out.push(name);
  }
  return out;
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

// ───────────── D98: private messages (mutual friends only) ─────────────

export const MESSAGE_MAX = 1000;
export const MESSAGE_PHOTOS_MAX = 4;
/** You can unsend your own message for this long. */
export const UNSEND_MINUTES = 15;

export const sendMessageSchema = z
  .strictObject({
    reading: locationReadingSchema,
    to: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_]{3,20}$/, 'Not a username'),
    body: z
      .string()
      .trim()
      .max(MESSAGE_MAX, `Keep it under ${MESSAGE_MAX} characters`)
      .refine(
        // eslint-disable-next-line no-control-regex
        (v) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v),
        'Invalid characters',
      )
      .default(''),
    photoIds: z.array(z.uuid()).max(MESSAGE_PHOTOS_MAX).optional(),
    confirmWarning: z.literal(true).optional(),
  })
  .refine((m) => m.body.length > 0 || !!m.photoIds?.length, {
    message: 'Write something first',
    path: ['body'],
  });

export interface ChatMessage {
  id: string;
  mine: boolean;
  body: string;
  photos: { id: string; url: string; width: number; height: number }[];
  createdAt: string;
  /** Still within the unsend window (your own messages only). */
  canUnsend: boolean;
}

export interface ConversationSummary {
  id: string;
  with: FriendUser;
  /** Short preview of the last message ("Photo" for a photo-only one). */
  preview: string;
  lastMessageAt: string;
  unread: boolean;
  /** Still friends and not blocked, so you can send. */
  canSend: boolean;
}
