import { z } from 'zod';
import type { MedalBadge } from './account';
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

/** D75: what a post carries, decided by the server from its attachments. */
export const POST_TYPES = ['text', 'media', 'voice', 'video'] as const;
export type PostType = (typeof POST_TYPES)[number];
/** Feed and room filter: one type, or all of them. */
export const POST_TYPE_FILTERS = ['all', ...POST_TYPES] as const;
export type PostTypeFilter = (typeof POST_TYPE_FILTERS)[number];

export const feedRequestSchema = z.strictObject({
  reading: locationReadingSchema,
  cursor: cursorSchema,
  sort: z.enum(FEED_SORTS).default('new'),
  /** D75: only posts of one type. */
  type: z.enum(POST_TYPE_FILTERS).default('all'),
  /** D74: search the area feed by username ("@name" for names only) or post text. */
  q: z.string().trim().min(2).max(50).optional(),
});

/** Sent after the person saw a screening warning and chose "post anyway" (P5.4). */
const confirmWarning = z.literal(true).optional();

/** P6.1: photos uploaded first (`POST /photos`), then attached by ID. Max 4 (config). */
export const PHOTOS_MAX = 4;
/** D75: voice clips are uploaded first (`POST /voice`), then attached by ID. */
export const VOICE_MAX_SECONDS = 60;
export const createPostSchema = z
  .strictObject({
    reading: locationReadingSchema,
    // A voice post may have no caption (D75); every other post needs text.
    body: z.union([postBodySchema, z.literal('')]).default(''),
    confirmWarning,
    photoIds: z.array(z.uuid()).max(PHOTOS_MAX).optional(),
    voiceId: z.uuid().optional(),
    /** D102: a video uploaded first (`POST /videos`), attached by ID. */
    videoId: z.uuid().optional(),
    /** D125: post into a citywide topic instead of the local area. */
    topicId: z.uuid().optional(),
  })
  .refine((p) => [p.voiceId, p.videoId, p.photoIds?.length].filter(Boolean).length <= 1, {
    message: 'A post can have photos or a voice clip, not both',
    path: ['voiceId'],
  })
  .refine((p) => p.body.length > 0 || !!p.voiceId || !!p.videoId, {
    message: 'Write something first',
    path: ['body'],
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
  /** `medals`: medals earned and their level (P6.9, D122), shown as small badges by the name. */
  author:
    | {
        username: string;
        medals: MedalBadge[];
        color: string;
        avatarUrl: string | null;
        /** D103: a verified owner of this place (place discussions only). */
        owner?: true;
        /** D141: a JaxSide staff member (shown as ADMIN under the name). */
        admin?: true;
      }
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
  /** D125: the citywide topic this post is in (no distance is shown for these). */
  topic: { id: string; title: string } | null;
  /** P6.4: short-lived signed links (relative to the API base URL). */
  photos: PhotoView[];
  /** D75: a voice post's clip (signed link), or null. */
  voice: VoiceView | null;
  /** D102: a video post's clip (signed link), or null. */
  video: VideoView | null;
  /** D75: text, media (photos/GIFs), voice or video. */
  type: PostType;
  /** D115: on your own profile, the neighborhood an area post was made in (null if none). */
  area?: string | null;
}

export interface VideoView {
  id: string;
  url: string;
  durationMs: number;
  width: number;
  height: number;
}

export interface VoiceView {
  id: string;
  url: string;
  durationMs: number;
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
  /** D141: `admin` marks a JaxSide staff member (ADMIN under the name). */
  author:
    { username: string; medals: MedalBadge[]; admin?: true } | { guest: true } | { deleted: true };
  score: number;
  myVote: -1 | 0 | 1;
  isMine: boolean;
}
