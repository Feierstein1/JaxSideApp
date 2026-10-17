import { z } from 'zod';
import { locationReadingSchema } from './location';

export const POST_MAX = 2000;
export const COMMENT_MAX = 1000;

/**
 * User-written text. Plain text only (P3.10): stored as typed, rendered as text, never
 * as HTML. Control characters other than newline and tab are rejected.
 */
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Write something first')
    .max(max, `Keep it under ${max} characters`)
    // eslint-disable-next-line no-control-regex
    .refine((v) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v), 'Invalid characters');

export const postBodySchema = text(POST_MAX);

export const BIO_MAX = 300;
/** P4.8 (early): the public profile bio. Empty string clears it. */
export const profileUpdateSchema = z.strictObject({
  bio: z.union([z.literal(''), text(BIO_MAX)]),
  confirmWarning: z.literal(true).optional(),
});
export const commentBodySchema = text(COMMENT_MAX);

/** Opaque pagination bookmark returned by list endpoints. */
const cursorSchema = z.string().max(200).optional();

export const FEED_SORTS = ['new', 'top'] as const;
export type FeedSort = (typeof FEED_SORTS)[number];

export const feedRequestSchema = z.strictObject({
  reading: locationReadingSchema,
  cursor: cursorSchema,
  sort: z.enum(FEED_SORTS).default('new'),
});

/** Sent after the person saw a screening warning and chose "post anyway" (P5.4). */
const confirmWarning = z.literal(true).optional();

/** P6.1: photos uploaded first (`POST /photos`), then attached by ID. Max 4 (config). */
export const PHOTOS_MAX = 4;
export const createPostSchema = z.strictObject({
  reading: locationReadingSchema,
  body: postBodySchema,
  confirmWarning,
  photoIds: z.array(z.uuid()).max(PHOTOS_MAX).optional(),
});

export const editPostSchema = z.strictObject({ body: postBodySchema, confirmWarning });
export const editCommentSchema = z.strictObject({ body: commentBodySchema, confirmWarning });

export const listCommentsSchema = z.strictObject({ reading: locationReadingSchema });

export const createCommentSchema = z.strictObject({
  reading: locationReadingSchema,
  body: commentBodySchema,
  parentCommentId: z.uuid().optional(),
  confirmWarning,
});

/** +1 upvote, -1 downvote, 0 removes your vote (D6). */
export const voteSchema = z.strictObject({
  reading: locationReadingSchema,
  value: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
});

export type DiscussionKind = 'general' | 'business';

/** What the app receives for a post. No coordinates, no private author data. */
export interface PostView {
  id: string;
  kind: DiscussionKind;
  body: string;
  createdAt: string;
  editedAt: string | null;
  /** `medals`: achievement keys earned (P6.9), shown as small icons by the name. */
  author:
    | { username: string; medals: string[]; color: string; avatarUrl: string | null }
    | { deleted: true };
  score: number;
  upCount: number;
  downCount: number;
  commentCount: number;
  myVote: -1 | 0 | 1;
  isMine: boolean;
  /** General posts: rounded distance from the reader. Business posts: null. */
  distanceMeters: number | null;
  place: { id: string; name: string } | null;
  /** P6.4: short-lived signed links (relative to the API base URL). */
  photos: PhotoView[];
}

export interface PhotoView {
  id: string;
  url: string;
  width: number;
  height: number;
}

export interface CommentView {
  id: string;
  parentCommentId: string | null;
  depth: number;
  /** Null when the comment was deleted or removed (kept so replies stay in place). */
  body: string | null;
  status: 'visible' | 'deleted' | 'removed';
  createdAt: string;
  editedAt: string | null;
  author: { username: string; medals: string[] } | { guest: true } | { deleted: true };
  score: number;
  myVote: -1 | 0 | 1;
  isMine: boolean;
}
