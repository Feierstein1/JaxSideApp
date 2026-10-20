import { z } from 'zod';
import { CATEGORY_GROUPS } from './directory';
import { locationReadingSchema } from './location';

/** P5.8: categories people can pick when suggesting a place (the directory's own). */
export const SUBMIT_CATEGORIES = [
  ...new Set(CATEGORY_GROUPS.flatMap((g) => [...g.categories])),
  'other',
] as const;

/** D69: at most 30 characters, so names fit on one line in the list. */
export const PLACE_NAME_MAX = 30;
const placeName = z
  .string()
  .trim()
  .min(2, 'Enter the place’s name')
  .max(PLACE_NAME_MAX, `Keep the name to ${PLACE_NAME_MAX} characters`);

/** P5.9: before submitting, see whether the place is already listed. */
export const submissionCheckSchema = z.strictObject({
  reading: locationReadingSchema,
  name: placeName,
});

/**
 * P5.8 (D63): suggest a missing place. The pin is where the person is standing (their
 * reading), so no map is needed; the address is optional text.
 */
export const submissionCreateSchema = z.strictObject({
  reading: locationReadingSchema,
  name: placeName,
  category: z.enum(SUBMIT_CATEGORIES as unknown as [string, ...string[]]),
  address: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
  confirmWarning: z.literal(true).optional(),
});

/** P5.12: an admin's decision on one submission. */
export const submissionDecisionSchema = z.discriminatedUnion('decision', [
  z.strictObject({
    decision: z.literal('approve'),
    /** Optional corrections before it goes live. */
    name: placeName.optional(),
    category: z.enum(SUBMIT_CATEGORIES as unknown as [string, ...string[]]).optional(),
    address: z.string().trim().max(200).optional(),
  }),
  z.strictObject({
    decision: z.literal('reject'),
    reason: z.string().trim().min(3, 'A reason is required').max(500),
  }),
  z.strictObject({ decision: z.literal('merge'), placeId: z.uuid() }),
]);

/** P5.12: approve or reject several at once (the page confirms the list first). */
export const submissionBulkSchema = z.discriminatedUnion('decision', [
  z.strictObject({ decision: z.literal('approve'), ids: z.array(z.uuid()).min(1).max(100) }),
  z.strictObject({
    decision: z.literal('reject'),
    ids: z.array(z.uuid()).min(1).max(100),
    reason: z.string().trim().min(3).max(500),
  }),
]);

/** What the submitter sees in "My suggestions". */
export interface MySubmission {
  id: string;
  name: string;
  category: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DUPLICATE' | 'MERGED' | 'EXPIRED';
  decisionReason: string | null;
  placeId: string | null;
  createdAt: string;
}

export interface PlaceCandidate {
  id: string;
  name: string;
  category: string;
  distanceMeters: number;
}
