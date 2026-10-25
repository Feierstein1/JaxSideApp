import { z } from 'zod';
import { locationReadingSchema } from './location';

/*
 * D123 / D124: weekly polls. The owner writes them in the admin portal; accounts vote once
 * from inside Duval; results show after the poll closes, per answer and per ZIP code (ZIPs
 * with fewer than POLL_MIN_GROUP voters are combined or hidden). Each poll has a type and a
 * topic; votes are stored the same way for every type (one row per answer picked).
 */

/** Smallest group shown on its own in results (same as area statistics, D116). */
export const POLL_MIN_GROUP = 10;
/** A poll stays open at least an hour and at most 31 days. */
export const POLL_MIN_HOURS = 1;
export const POLL_MAX_DAYS = 31;

/** D124: how a poll is answered. */
export const POLL_KINDS = {
  yes_no: { label: 'Yes / No', hint: 'Yes or No (and optionally “Not sure”).' },
  single: { label: 'Pick one', hint: 'Several answers; people pick one.' },
  multi: { label: 'Pick several', hint: 'Several answers; people pick all that apply.' },
  scale: { label: 'Rating 1–5', hint: 'A 1 to 5 rating with words for each end.' },
} as const;
export type PollKind = keyof typeof POLL_KINDS;

/** D124: topics, so polls can be grouped and compared over time. */
export const POLL_TOPICS = {
  city: 'City & politics',
  prices: 'Prices & cost of living',
  transport: 'Getting around',
  safety: 'Safety',
  food_fun: 'Food & fun',
  sports: 'Sports',
  community: 'Community',
  other: 'Other',
} as const;
export type PollTopic = keyof typeof POLL_TOPICS;

/** Answers allowed per type (Yes / No and Rating are created by the server). */
export const POLL_LIMITS = { single: { min: 2, max: 6 }, multi: { min: 2, max: 8 } } as const;
/** Rating scales are 1 to SCALE_MAX. */
export const POLL_SCALE_MAX = 5;

/** D133: suggest a poll question; the admin turns it into a poll or declines it. */
export const suggestPollSchema = z.strictObject({
  question: z.string().trim().min(5).max(200),
  details: z.string().trim().min(1).max(500).optional(),
  topic: z.enum(Object.keys(POLL_TOPICS) as [PollTopic, ...PollTopic[]]).default('other'),
});
export type SuggestPollRequest = z.infer<typeof suggestPollSchema>;

export const pollVoteSchema = z.strictObject({
  reading: locationReadingSchema,
  /** One answer, or several for Pick several (checked against the poll on the server). */
  choiceIds: z
    .array(z.uuid())
    .min(1)
    .max(POLL_LIMITS.multi.max)
    .refine((ids) => new Set(ids).size === ids.length, 'Each answer only once'),
});
export type PollVoteRequest = z.infer<typeof pollVoteSchema>;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const topicKeys = Object.keys(POLL_TOPICS) as [PollTopic, ...PollTopic[]];

const common = {
  topic: z.enum(topicKeys),
  question: text(5, 200),
  details: text(1, 500).optional(),
  opensAt: z.iso.datetime({ offset: true }),
  closesAt: z.iso.datetime({ offset: true }),
};
const answers = (min: number, max: number) => z.array(text(1, 80)).min(min).max(max);

/** Admin: create or edit (before it opens) a poll. */
export const adminPollSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ ...common, kind: z.literal('yes_no'), includeUnsure: z.boolean() }),
    z.strictObject({
      ...common,
      kind: z.literal('single'),
      choices: answers(POLL_LIMITS.single.min, POLL_LIMITS.single.max),
    }),
    z.strictObject({
      ...common,
      kind: z.literal('multi'),
      choices: answers(POLL_LIMITS.multi.min, POLL_LIMITS.multi.max),
      /** The most answers one person may pick; leave out for "all that apply". */
      maxPicks: z.int().min(2).max(POLL_LIMITS.multi.max).optional(),
    }),
    z.strictObject({
      ...common,
      kind: z.literal('scale'),
      lowLabel: text(1, 40),
      highLabel: text(1, 40),
    }),
  ])
  .superRefine((p, ctx) => {
    const span = Date.parse(p.closesAt) - Date.parse(p.opensAt);
    if (span < POLL_MIN_HOURS * 3_600_000) {
      ctx.addIssue({
        code: 'custom',
        path: ['closesAt'],
        message: 'A poll must stay open at least an hour',
      });
    }
    if (span > POLL_MAX_DAYS * 86_400_000) {
      ctx.addIssue({
        code: 'custom',
        path: ['closesAt'],
        message: `A poll can stay open at most ${POLL_MAX_DAYS} days`,
      });
    }
    if ('choices' in p) {
      if (new Set(p.choices.map((c) => c.toLowerCase())).size !== p.choices.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['choices'],
          message: 'Each answer must be different',
        });
      }
      if (p.kind === 'multi' && p.maxPicks !== undefined && p.maxPicks >= p.choices.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['maxPicks'],
          message: '“Up to” must be less than the number of answers (or leave it empty)',
        });
      }
    }
  });
export type AdminPollRequest = z.infer<typeof adminPollSchema>;

export interface PollCounts {
  /** People who voted in this group. */
  voters: number;
  /** How many picked each answer, in the poll's order (percent = count / voters). */
  counts: { choiceId: string; count: number }[];
  /** Rating scales: the average rating (1–5), else null. */
  average: number | null;
}

/** After a poll closes: citywide totals and the ZIP codes with enough voters. */
export interface PollResults extends PollCounts {
  /** ZIP codes with at least POLL_MIN_GROUP voters, most voters first. */
  areas: (PollCounts & { zip: string })[];
  /** Every smaller ZIP (and votes outside the ZIP areas) together, if that's 10 or more. */
  otherAreas: PollCounts | null;
}

export type PollStatus = 'upcoming' | 'open' | 'closed';

export interface PollView {
  id: string;
  kind: PollKind;
  topic: PollTopic;
  question: string;
  details: string | null;
  /** Pick several: the most answers one person may pick (null = all that apply). */
  maxPicks: number | null;
  /** Rating scales: the words for 1 and 5. */
  scale: { low: string; high: string } | null;
  opensAt: string;
  closesAt: string;
  status: PollStatus;
  /** `value` is the number for rating answers (1–5). */
  choices: { id: string; label: string; value: number | null }[];
  /** Your answers while the poll is open (empty if you haven't voted, or for guests). */
  myChoiceIds: string[];
  /**
   * You can vote in it now: it's open, you haven't voted, and your account may vote
   * (confirmed, a few days old; never guests). Home shows the poll before Citywide only then.
   */
  canVote: boolean;
  /**
   * Totals. D133: while open, only for people who voted (live, citywide, with how many voted);
   * once closed, for everyone (with the ZIP breakdown).
   */
  results: PollResults | null;
}
