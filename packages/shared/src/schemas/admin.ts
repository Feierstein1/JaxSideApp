import { z } from 'zod';
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

export const caseDecisionSchema = z.strictObject({
  decision: z.enum(CASE_DECISIONS),
  /** Recorded; shown to the person if they get a strike. */
  reason: reasonText,
  internalNote,
  strike: z.boolean().optional(),
});

/** P5.6 from the portal: actions on a user. */
export const userActionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('strike'), reason: reasonText, internalNote }),
  z.strictObject({
    action: z.literal('suspend'),
    hours: z
      .number()
      .int()
      .min(1)
      .max(24 * 365),
    reason: reasonText,
    internalNote,
  }),
  z.strictObject({ action: z.literal('ban'), reason: reasonText, internalNote }),
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
