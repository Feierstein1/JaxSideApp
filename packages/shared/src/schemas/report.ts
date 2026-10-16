import { z } from 'zod';
import { locationReadingSchema } from './location';

/** P5.1: why something is reported. Matches the server's `ReportReason` enum. */
export const REPORT_REASONS = [
  'SPAM',
  'HARASSMENT',
  'THREAT',
  'HATE',
  'DOXXING',
  'SEXUAL_CONTENT',
  'CHILD_SAFETY',
  'IMPERSONATION',
  'SCAM',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  SPAM: 'Spam',
  HARASSMENT: 'Harassment or bullying',
  THREAT: 'Threat or violence',
  HATE: 'Hate',
  DOXXING: 'Sharing private information',
  SEXUAL_CONTENT: 'Sexual content',
  CHILD_SAFETY: 'Child safety',
  IMPERSONATION: 'Impersonation',
  SCAM: 'Scam or fraud',
  OTHER: 'Something else',
};

export const REPORT_DETAILS_MAX = 1000;

export const reportTargetSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('general'), id: z.uuid() }),
  z.strictObject({ type: z.literal('business'), id: z.uuid() }),
  z.strictObject({ type: z.literal('comment'), id: z.uuid() }),
  z.strictObject({
    type: z.literal('user'),
    // Any existing name (old names can predate today's rules), so no reserved-word check.
    username: z.string().regex(/^[A-Za-z0-9_]{3,20}$/),
  }),
]);
export type ReportTarget = z.infer<typeof reportTargetSchema>;

/** P5.1: report a post, comment or profile. Photos come with P6. */
export const reportCreateSchema = z.strictObject({
  reading: locationReadingSchema,
  target: reportTargetSchema,
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(REPORT_DETAILS_MAX).optional(),
});

/** What you see in "My reports". Never the moderator's identity or notes. */
export interface MyReport {
  id: string;
  targetType: 'general' | 'business' | 'comment' | 'user';
  /** A short preview of what was reported (or the username). */
  preview: string;
  reason: ReportReason;
  status: 'OPEN' | 'ACTIONED' | 'DISMISSED';
  createdAt: string;
  resolvedAt: string | null;
}
