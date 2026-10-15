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

export const createPostSchema = z.strictObject({
  reading: locationReadingSchema,
  body: postBodySchema,
});

export const editPostSchema = z.strictObject({ body: postBodySchema });
export const editCommentSchema = z.strictObject({ body: commentBodySchema });

export const listCommentsSchema = z.strictObject({ reading: locationReadingSchema });

export const createCommentSchema = z.strictObject({
  reading: locationReadingSchema,
  body: commentBodySchema,
  parentCommentId: z.uuid().optional(),
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
  author: { username: string } | { deleted: true };
  score: number;
  upCount: number;
  downCount: number;
  commentCount: number;
  myVote: -1 | 0 | 1;
  isMine: boolean;
  /** General posts: rounded distance from the reader. Business posts: null. */
  distanceMeters: number | null;
  place: { id: string; name: string } | null;
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
  author: { username: string } | { guest: true } | { deleted: true };
  score: number;
  myVote: -1 | 0 | 1;
  isMine: boolean;
}
