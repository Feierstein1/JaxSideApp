import { z } from 'zod';
import { locationReadingSchema } from './location';

/*
 * D125: citywide discussion topics. Posts in a topic are ordinary area posts tagged with it
 * (no radius: anywhere inside Duval). The admin creates topics; users can suggest them.
 */

export const TOPIC_TITLE_MAX = 80;
export const TOPIC_DESCRIPTION_MAX = 500;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

/** A user's suggestion. */
export const suggestTopicSchema = z.strictObject({
  title: text(4, TOPIC_TITLE_MAX),
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
    description: text(1, TOPIC_DESCRIPTION_MAX).optional(),
  }),
  z.strictObject({ action: z.literal('reject'), reason: text(3, 300) }),
  z.strictObject({ action: z.literal('close') }),
  z.strictObject({ action: z.literal('reopen') }),
]);

export type TopicStatus = 'open' | 'closed';

export interface TopicView {
  id: string;
  title: string;
  description: string | null;
  pinned: boolean;
  status: TopicStatus;
  /** When it ends on its own, if set. */
  closesAt: string | null;
  postCount: number;
  /** Newest post, for "active 5 min ago". */
  lastPostAt: string | null;
}

/** Your own suggestion and what happened to it. */
export interface MyTopicSuggestion {
  id: string;
  title: string;
  status: 'waiting' | 'approved' | 'rejected';
  reason: string | null;
  createdAt: string;
}
