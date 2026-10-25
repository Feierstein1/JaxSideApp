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
]);

/** P5.7: deciding an appeal. The note is shown to the person. */
export const appealDecisionSchema = z.strictObject({
  accept: z.boolean(),
  note: z.string().trim().min(3).max(500),
});
