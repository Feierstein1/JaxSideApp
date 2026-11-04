import { z } from 'zod';

/**
 * D188: giveaways run from the admin portal. Every criterion is optional; accounts must
 * always be active users. Dates are ISO strings (the portal sends the admin's local time).
 */

const count = (max: number) => z.number().int().min(1).max(max).optional();
const when = z.iso.datetime({ offset: true });

export const giveawayCreateSchema = z
  .strictObject({
    title: z.string().trim().min(3).max(100),
    prize: z.string().trim().min(3).max(200),
    notes: z.string().trim().max(2000).optional(),
    startsAt: when,
    endsAt: when,
    pickMethod: z.enum(['RANDOM', 'MANUAL']),
    winnerCount: z.number().int().min(1).max(100),
    respondDays: z.number().int().min(1).max(30).default(5),
    minPosts: count(1000),
    minPostDays: count(366),
    minComments: count(5000),
    minApprovedPlaces: count(500),
    requireConfirmedEmail: z.boolean().default(true),
    requireNoStrikes: z.boolean().default(false),
    joinedAfter: when.optional(),
    joinedBefore: when.optional(),
    minAccountAgeDays: count(3650),
    /** Opened the app on at least this many days in the entry period. */
    minActiveDays: count(366),
    /** Random draw: one ticket per day they opened the app in the entry period. */
    ticketsPerActiveDay: z.boolean().default(false),
    excludePastWinners: z.boolean().default(false),
  })
  .refine((g) => new Date(g.endsAt) > new Date(g.startsAt), {
    message: 'The entry period must end after it starts',
    path: ['endsAt'],
  })
  .refine(
    (g) => !g.joinedAfter || !g.joinedBefore || new Date(g.joinedBefore) > new Date(g.joinedAfter),
    { message: '"Joined before" must be after "joined after"', path: ['joinedBefore'] },
  );

/** D188: what an admin does to a giveaway. */
export const giveawayActionSchema = z.discriminatedUnion('action', [
  /** Random giveaways: fills the open winner slots from the eligible accounts. */
  z.strictObject({ action: z.literal('draw') }),
  /** Hand-picked giveaways: one eligible account by username. */
  z.strictObject({ action: z.literal('pick'), username: z.string().trim().min(1).max(21) }),
  z.strictObject({ action: z.literal('cancel'), reason: z.string().trim().min(3).max(500) }),
]);

/** D188: what an admin does to one winner. */
export const giveawayWinnerActionSchema = z.discriminatedUnion('action', [
  /** Only after the winner accepted; the reason goes in the audit log. */
  z.strictObject({ action: z.literal('revealEmail'), reason: z.string().trim().min(3).max(300) }),
  z.strictObject({ action: z.literal('prizeSent'), note: z.string().trim().max(500).optional() }),
  z.strictObject({ action: z.literal('disqualify'), reason: z.string().trim().min(3).max(500) }),
]);

/** D188: the winner's answer in the app. */
export const giveawayResponseSchema = z.strictObject({ accept: z.boolean() });

export type GiveawayWinStatus =
  'NOTIFIED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'PRIZE_SENT' | 'DISQUALIFIED';

/** D188: a win as the winner sees it (never anyone else's details). */
export interface GiveawayWinView {
  id: string;
  title: string;
  prize: string;
  status: GiveawayWinStatus;
  respondBy: string;
  /** The account email with most of it hidden ("j•••@gmail.com"), so they can check it. */
  maskedEmail: string | null;
  createdAt: string;
}
