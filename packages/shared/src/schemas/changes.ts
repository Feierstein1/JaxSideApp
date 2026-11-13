import { z } from 'zod';
import { PLACE_NAME_MAX, SUBMIT_CATEGORIES } from './submission';

/**
 * D242 (D238 A): an Owner asks JaxSide to change its place's details (the website sends
 * this). Each field is optional, at least one; a new pin comes with both coordinates and is
 * checked to be inside Duval when approved. `note` is for the reviewer.
 */
export const placeChangeRequestSchema = z
  .strictObject({
    placeId: z.uuid(),
    name: z.string().trim().min(2).max(PLACE_NAME_MAX).optional(),
    category: z.enum(SUBMIT_CATEGORIES as unknown as [string, ...string[]]).optional(),
    address: z.string().trim().min(5).max(300).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((r) => (r.latitude === undefined) === (r.longitude === undefined), {
    path: ['latitude'],
    message: 'A pin needs both latitude and longitude',
  })
  .refine(
    (r) =>
      r.name !== undefined ||
      r.category !== undefined ||
      r.address !== undefined ||
      r.latitude !== undefined,
    { path: ['name'], message: 'Change at least one thing' },
  );
export type PlaceChangeRequestInput = z.input<typeof placeChangeRequestSchema>;

/** D242 (D238 A): an organizer asks to change its organizer name. */
export const organizerNameRequestSchema = z.strictObject({
  name: z.string().trim().min(2).max(100),
  note: z.string().trim().max(500).optional(),
});

/** D242: JaxSide approves a change, or turns it down with a note the business reads. */
export const adminChangeDecisionSchema = z
  .strictObject({
    decision: z.enum(['approve', 'reject']),
    note: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.decision === 'approve' || (d.note?.length ?? 0) >= 3, {
    path: ['note'],
    message: 'Say why, in a few words (the business sees it)',
  });
export type AdminChangeDecision = z.infer<typeof adminChangeDecisionSchema>;

/** D242: the kinds in JaxSide's one review queue, in the order the counts show. */
export const REVIEW_KINDS = [
  'place',
  'event',
  'ad',
  'organizer',
  'placeChange',
  'organizerName',
] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];
export const REVIEW_KIND_LABELS: Record<ReviewKind, string> = {
  place: 'Place to verify or add',
  event: 'Event',
  ad: 'Ad',
  organizer: 'Organizer to check',
  placeChange: 'Place details change',
  organizerName: 'Organizer name change',
};
