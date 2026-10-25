import { z } from 'zod';
import { locationReadingSchema } from './location';
import { POLL_TOPICS, type PollTopic } from './polls';

/*
 * D125: citywide discussion topics. Posts in a topic are ordinary area posts tagged with it
 * (no radius: anywhere inside Duval). The admin creates topics; users can suggest them.
 */

export const TOPIC_TITLE_MAX = 80;

/**
 * D131: citywide topics use the same categories as polls (D124), so both can be grouped
 * and compared the same way.
 */
export const TOPIC_CATEGORIES = POLL_TOPICS;
export type TopicCategory = PollTopic;
const categoryKeys = Object.keys(TOPIC_CATEGORIES) as [TopicCategory, ...TopicCategory[]];
const category = z.enum(categoryKeys);
export const TOPIC_DESCRIPTION_MAX = 500;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

/** D133: a topic for all of Duval, or one tied to where it was made ("Near me"). */
export const TOPIC_SCOPES = ['city', 'local'] as const;
export type TopicScope = (typeof TOPIC_SCOPES)[number];
/** D133: topics per page in View all topics. */
export const TOPIC_PAGE_SIZE = 20;

/** D133: create a topic (anyone with a confirmed account; screened like posts). */
export const createTopicSchema = z.strictObject({
  reading: locationReadingSchema,
  scope: z.enum(TOPIC_SCOPES),
  title: text(4, TOPIC_TITLE_MAX),
  category: category.default('other'),
  description: text(1, TOPIC_DESCRIPTION_MAX).optional(),
  /** D134: show your username as the creator (off by default). */
  showCreator: z.boolean().default(false),
  confirmWarning: z.literal(true).optional(),
});
export type CreateTopicRequest = z.input<typeof createTopicSchema>;

/** D134: the only thing a creator can change later: whether their username shows. */
export const updateTopicSchema = z.strictObject({ showCreator: z.boolean() });

/**
 * D133: topics of one kind, newest or oldest first, optionally filtered by words, category
 * or the ones you follow. Local topics need the reading (within half a mile of you).
 */
export const topicListSchema = z.strictObject({
  reading: locationReadingSchema,
  scope: z.enum(TOPIC_SCOPES),
  q: z.string().trim().max(60).optional(),
  category: category.optional(),
  following: z.boolean().optional(),
  /** D134: only topics you started ("My created discussions"). */
  mine: z.boolean().optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
  /** Open topics only (the City Topics page's newest three). */
  openOnly: z.boolean().optional(),
  limit: z.int().min(1).max(TOPIC_PAGE_SIZE).default(TOPIC_PAGE_SIZE),
  cursor: z.string().max(200).optional(),
});
export type TopicListRequest = z.input<typeof topicListSchema>;

/** A user's suggestion (D125; the app now creates topics directly, D133). */
export const suggestTopicSchema = z.strictObject({
  title: text(4, TOPIC_TITLE_MAX),
  category: category.default('other'),
  description: text(1, TOPIC_DESCRIPTION_MAX).optional(),
});
export type SuggestTopicRequest = z.infer<typeof suggestTopicSchema>;

/** A topic's posts, citywide (the reading only proves you're inside Duval). */
export const topicPostsSchema = z.strictObject({
  reading: locationReadingSchema,
  cursor: z.string().max(200).optional(),
  sort: z.enum(['new', 'top']).default('new'),
  type: z.enum(['all', 'text', 'media', 'voice', 'video']).default('all'),
});

/** Admin: create a topic, or change one. */
export const adminTopicSchema = z
  .strictObject({
    title: text(4, TOPIC_TITLE_MAX),
    category: category.default('other'),
    description: text(1, TOPIC_DESCRIPTION_MAX).optional(),
    pinned: z.boolean().default(false),
    opensAt: z.iso.datetime({ offset: true }).optional(),
    closesAt: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((t) => !t.opensAt || !t.closesAt || Date.parse(t.closesAt) > Date.parse(t.opensAt), {
    message: 'The end must be after the start',
    path: ['closesAt'],
  });
export type AdminTopicRequest = z.infer<typeof adminTopicSchema>;

/** Admin: approve a suggestion (optionally reworded), reject it, or close / reopen a topic. */
export const adminTopicDecisionSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('approve'),
    title: text(4, TOPIC_TITLE_MAX).optional(),
    category: category.optional(),
    description: text(1, TOPIC_DESCRIPTION_MAX).optional(),
  }),
  z.strictObject({ action: z.literal('reject'), reason: text(3, 300) }),
  z.strictObject({ action: z.literal('close') }),
  z.strictObject({ action: z.literal('reopen') }),
]);

export type TopicStatus = 'open' | 'closed';

export interface TopicView {
  id: string;
  /** D133: city (all of Duval) or local (within half a mile of where it was made). */
  scope: TopicScope;
  title: string;
  /** D131: one of TOPIC_CATEGORIES. */
  category: TopicCategory;
  description: string | null;
  pinned: boolean;
  status: TopicStatus;
  /** When it started (newest first on Home). */
  opensAt: string;
  /** When it ends on its own, if set. */
  closesAt: string | null;
  postCount: number;
  /** Newest post, for "active 5 min ago". */
  lastPostAt: string | null;
  /** D133: when it was created (shown on cards). */
  createdAt: string;
  /** D133: how many follow it, and whether you do. */
  followerCount: number;
  following: boolean;
  /** D133: you made it (shown with a ★ to you only). */
  isMine: boolean;
  /** D134: the creator's username, only if they chose to show it. */
  creator: string | null;
  /** D134: whether your username shows (only sent to the creator). */
  showCreator?: boolean;
}

/** D133: one page of topics. */
export interface TopicPage {
  topics: TopicView[];
  nextCursor: string | null;
  /** Local topics: the closest named neighborhood to you (like Home's "Near Avondale"). */
  area?: string | null;
}

/** Your own suggestion and what happened to it. */
export interface MyTopicSuggestion {
  id: string;
  title: string;
  status: 'waiting' | 'approved' | 'rejected';
  reason: string | null;
  createdAt: string;
}
