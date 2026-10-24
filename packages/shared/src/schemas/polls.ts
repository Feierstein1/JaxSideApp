import { z } from 'zod';
import { locationReadingSchema } from './location';

/*
 * D123: weekly polls. The owner writes them in the admin portal; accounts vote once from
 * inside Duval; results show after the poll closes, per choice and per ZIP code (ZIPs with
 * fewer than POLL_MIN_GROUP voters are combined or hidden).
 */

export const POLL_CHOICES_MIN = 2;
export const POLL_CHOICES_MAX = 6;
/** Smallest group shown on its own in results (same as area statistics, D116). */
export const POLL_MIN_GROUP = 10;
/** A poll stays open at least an hour and at most 31 days. */
export const POLL_MIN_HOURS = 1;
export const POLL_MAX_DAYS = 31;

export const pollVoteSchema = z.strictObject({
  reading: locationReadingSchema,
  choiceId: z.uuid(),
});
export type PollVoteRequest = z.infer<typeof pollVoteSchema>;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

/** Admin: create or edit (before it opens) a poll. */
export const adminPollSchema = z
  .strictObject({
    question: text(5, 200),
    details: text(1, 500).optional(),
    choices: z.array(text(1, 80)).min(POLL_CHOICES_MIN).max(POLL_CHOICES_MAX),
    opensAt: z.iso.datetime({ offset: true }),
    closesAt: z.iso.datetime({ offset: true }),
  })
  .refine((p) => new Set(p.choices.map((c) => c.toLowerCase())).size === p.choices.length, {
    message: 'Each choice must be different',
    path: ['choices'],
  })
  .refine((p) => Date.parse(p.closesAt) - Date.parse(p.opensAt) >= POLL_MIN_HOURS * 3_600_000, {
    message: 'A poll must stay open at least an hour',
    path: ['closesAt'],
  })
  .refine((p) => Date.parse(p.closesAt) - Date.parse(p.opensAt) <= POLL_MAX_DAYS * 86_400_000, {
    message: `A poll can stay open at most ${POLL_MAX_DAYS} days`,
    path: ['closesAt'],
  });
export type AdminPollRequest = z.infer<typeof adminPollSchema>;

export interface PollCounts {
  /** People who voted in this group. */
  voters: number;
  /** Votes per choice, in the poll's choice order. */
  counts: { choiceId: string; count: number }[];
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
  question: string;
  details: string | null;
  opensAt: string;
  closesAt: string;
  status: PollStatus;
  choices: { id: string; label: string }[];
  /** Your vote while the poll is open (null if you haven't voted, or for guests). */
  myChoiceId: string | null;
  /** Totals, only once the poll has closed. */
  results: PollResults | null;
}
