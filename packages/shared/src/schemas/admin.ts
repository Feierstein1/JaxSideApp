import { z } from 'zod';
import { AD_LIVE_MAX } from '../ads';
import { loginRequestSchema } from './auth';

/** P5.11: admin sign-in step 1 is the normal credential check. */
export const adminLoginSchema = loginRequestSchema;

/** Step 2: the signed challenge from step 1 and the 6-digit authenticator code. */
export const adminLoginVerifySchema = z.strictObject({
  challenge: z.string().min(10).max(300),
  code: z
    .string()
    .trim()
    .regex(/^\d{3} ?\d{3}$/, 'Enter the 6-digit code'),
});

/** P5.14: what an admin decides on a reported item. */
export const CASE_TYPES = [
  'general',
  'business',
  'comment',
  'photo',
  'user',
  'message',
  'topic', // D133
] as const;
export const CASE_DECISIONS = ['remove', 'approve', 'dismiss', 'escalate'] as const;

const reasonText = z.string().trim().min(3, 'Give a short reason').max(1000);
const internalNote = z.string().trim().max(2000).optional();
/** D196: may be left blank (removing, dismissing, strikes, suspensions, bans); the server fills one in. */
const optionalReason = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .transform((v) => v || undefined);

/** D196: what the person sees on a strike, suspension or ban when the admin gave no reason. */
export const DEFAULT_ENFORCEMENT_REASON = 'Broke the Community Guidelines';

export const caseDecisionSchema = z
  .strictObject({
    decision: z.enum(CASE_DECISIONS),
    /** Recorded; shown to the person with a strike or removal notice. Blank: a standard one (D196). */
    reason: optionalReason,
    internalNote,
    strike: z.boolean().optional(),
    /** D205: removing only: put "your post was removed" (with the reason) in the author's bell. */
    notifyAuthor: z.boolean().optional(),
  })
  .refine((d) => !d.notifyAuthor || d.decision === 'remove', {
    path: ['notifyAuthor'],
    message: 'Only a removal can notify the author',
  })
  // A child-safety escalation goes on the legal hold, so it always says why.
  .refine((d) => d.decision !== 'escalate' || (d.reason?.length ?? 0) >= 3, {
    path: ['reason'],
    message: 'Give a short reason',
  });

/** P5.6 from the portal: actions on a user. */
export const userActionSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('strike'),
    reason: optionalReason,
    internalNote,
    /** "Notify" from the user's page: the strike is tied to this report about them. */
    reportId: z.uuid().optional(),
  }),
  z.strictObject({
    action: z.literal('suspend'),
    hours: z
      .number()
      .int()
      .min(1)
      .max(24 * 365),
    reason: optionalReason,
    internalNote,
  }),
  z.strictObject({ action: z.literal('ban'), reason: optionalReason, internalNote }),
  z.strictObject({ action: z.literal('lift'), reason: reasonText, internalNote }),
  z.strictObject({ action: z.literal('note'), reason: reasonText, internalNote }),
  z.strictObject({ action: z.literal('void'), strikeId: z.uuid(), reason: reasonText }),
  /** D141: show or hide the ADMIN badge (no admin access; that's the promote command). */
  z.strictObject({ action: z.literal('staffBadge'), on: z.boolean(), reason: reasonText }),
]);

/** D144: an admin locks or unlocks voting on a place, or clears its votes (abuse). */
export const placeRatingsAdminSchema = z.strictObject({
  action: z.enum(['lock', 'unlock', 'clear']),
  reason: reasonText,
});

/** P5.7: deciding an appeal. The note is shown to the person. */
export const appealDecisionSchema = z.strictObject({
  accept: z.boolean(),
  note: z.string().trim().min(3).max(500),
});

// ───────────────────────── Screening rules (P15.9) ─────────────────────────

export const SCREENING_ACTIONS = ['BLOCK', 'HOLD', 'WARN'] as const;
export const SCREENING_CATEGORIES = [
  'SLUR',
  'THREAT',
  'SEXUAL',
  'HARASSMENT',
  'DOXXING',
  'SPAM',
  'OTHER',
] as const;
export const SCREENING_MATCHES = ['WORD', 'CONTAINS'] as const;

/** Add a screening term. */
export const screeningRuleSchema = z.strictObject({
  term: z.string().trim().min(2).max(100),
  match: z.enum(SCREENING_MATCHES).default('WORD'),
  action: z.enum(SCREENING_ACTIONS),
  category: z.enum(SCREENING_CATEGORIES),
  /** Shown to the person when it matches (optional). */
  message: z.string().trim().min(1).max(300).optional(),
});

/** Change a term: turn it on or off, or change what it does. */
export const screeningRuleUpdateSchema = z
  .strictObject({
    enabled: z.boolean().optional(),
    action: z.enum(SCREENING_ACTIONS).optional(),
    category: z.enum(SCREENING_CATEGORIES).optional(),
    message: z.string().trim().max(300).nullable().optional(),
  })
  .refine((u) => Object.keys(u).length > 0, 'Nothing to change');

/** Try a sentence against the rules. */
export const screeningTestSchema = z.strictObject({ text: z.string().min(1).max(2000) });

/** B3.3 / D206: approve an ad, or turn it down with a reason the business sees. */
export const adminAdDecisionSchema = z
  .strictObject({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .refine((d) => d.decision === 'approve' || d.reason, {
    path: ['reason'],
    message: 'Say what needs to change',
  });
export type AdminAdDecision = z.infer<typeof adminAdDecisionSchema>;

/** B1.7 / D172: the admin portal's Businesses section. */
export const adminBusinessActionSchema = z.strictObject({
  action: z.enum(['suspend', 'unsuspend', 'revoke', 'reset-password', 'remove-picture']),
  note: z.string().trim().max(500).optional(),
});

/** D191: a strike on a business login (`reportId`: "Notify" from a report), or cancelling one. */
export const adminBusinessStrikeSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('strike'),
    reason: optionalReason,
    internalNote,
    reportId: z.uuid().optional(),
  }),
  z.strictObject({ action: z.literal('void'), strikeId: z.uuid(), reason: reasonText }),
]);

export const adminMoveBusinessOwnerSchema = z.strictObject({
  toEmail: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  removeOldTeam: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

/** B3.1 / D168: a subscription plan (admin-edited data; any number of tiers, Q28 prices open). */
export const adminPlanSchema = z.strictObject({
  name: z.string().trim().min(2).max(60),
  liveAdLimit: z.number().int().min(0).max(AD_LIVE_MAX), // D204: up to 5
  /** Monthly price in cents; null while prices aren't decided. */
  priceCents: z.number().int().min(0).max(10_000_000).nullable(),
  includesInsights: z.boolean(),
  /** Offered to new businesses (existing subscriptions keep their plan either way). */
  active: z.boolean(),
});

/** B3.1: give a business a plan for free (a promo), from now or a date, open-ended or until a date. */
export const adminCompSchema = z
  .strictObject({
    planId: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }).optional(),
    endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
    note: z.string().trim().max(300).optional(),
  })
  .refine((v) => !v.endsAt || !v.startsAt || new Date(v.endsAt) > new Date(v.startsAt), {
    message: 'The end must be after the start',
    path: ['endsAt'],
  });

export const adminEndSubscriptionSchema = z.strictObject({
  note: z.string().trim().max(300).optional(),
});
