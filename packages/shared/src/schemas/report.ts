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
  'SELF_PROMOTION', // D227
  'OTHER',
  // D209: for ads only (D207's photo rules: show what you really sell).
  'AD_MISLEADING',
  'AD_AI_FOOD',
  'AD_AI_IMAGE',
  // D230: for events only.
  'EVENT_WRONG_DETAILS',
  'EVENT_FAKE',
  // D236: only the venue place's owner, from the website ("Not at my place").
  'EVENT_NOT_AT_MY_PLACE',
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
  SELF_PROMOTION: 'Advertising or self-promotion',
  OTHER: 'Something else',
  AD_MISLEADING: 'Misleading or false offer',
  AD_AI_FOOD: 'AI-made food or drink photo',
  AD_AI_IMAGE: 'Over-the-top AI flyer or image',
  EVENT_WRONG_DETAILS: 'Wrong date, time or place, or called off',
  EVENT_FAKE: 'Not a real event',
  EVENT_NOT_AT_MY_PLACE: 'Not held at this place (the place’s owner)',
};

/** D209: the reasons that apply to ads, in the order the app lists them. */
export const AD_REPORT_REASONS = [
  'AD_MISLEADING',
  'AD_AI_FOOD',
  'AD_AI_IMAGE',
  'SCAM',
  'SEXUAL_CONTENT',
  'HATE',
  'OTHER',
] as const satisfies readonly ReportReason[];

/** D230: the reasons that apply to events, in the order the app lists them. */
export const EVENT_REPORT_REASONS = [
  'EVENT_WRONG_DETAILS',
  'EVENT_FAKE',
  'SCAM',
  'SPAM',
  'HATE',
  'SEXUAL_CONTENT',
  'AD_AI_IMAGE',
  'OTHER',
] as const satisfies readonly ReportReason[];

/** The reasons for everything else (posts, comments, photos, people, messages, topics). */
export const CONTENT_REPORT_REASONS = REPORT_REASONS.filter(
  (r) => !r.startsWith('AD_') && !r.startsWith('EVENT_'),
) as Exclude<ReportReason, `AD_${string}` | `EVENT_${string}`>[];

export const REPORT_DETAILS_MAX = 1000;

export const reportTargetSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('general'), id: z.uuid() }),
  z.strictObject({ type: z.literal('business'), id: z.uuid() }),
  z.strictObject({ type: z.literal('comment'), id: z.uuid() }),
  /** P6.5: a photo on a post or a profile photo. */
  z.strictObject({ type: z.literal('photo'), id: z.uuid() }),
  /** D98: a private message (only someone in the chat can report it). */
  z.strictObject({ type: z.literal('message'), id: z.uuid() }),
  /** D133: a topic (its title or description). */
  z.strictObject({ type: z.literal('topic'), id: z.uuid() }),
  /** D209: an ad in the feeds. */
  z.strictObject({ type: z.literal('ad'), id: z.uuid() }),
  /** D230: an event on the calendar. */
  z.strictObject({ type: z.literal('event'), id: z.uuid() }),
  /** D230: someone's lines in an event's chat (you must have joined that chat). */
  z.strictObject({
    type: z.literal('eventChat'),
    eventId: z.uuid(),
    username: z.string().regex(/^[A-Za-z0-9_]{3,20}$/),
  }),
  /** D218: someone's recent area-chat lines (you must be in the same room). */
  z.strictObject({ type: z.literal('chat'), username: z.string().regex(/^[A-Za-z0-9_]{3,20}$/) }),
  z.strictObject({
    type: z.literal('user'),
    // Any existing name (old names can predate today's rules), so no reserved-word check.
    username: z.string().regex(/^[A-Za-z0-9_]{3,20}$/),
  }),
]);
export type ReportTarget = z.infer<typeof reportTargetSchema>;

/** P5.1: report a post, comment or profile. Photos come with P6. */
export const reportCreateSchema = z
  .strictObject({
    reading: locationReadingSchema,
    target: reportTargetSchema,
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().max(REPORT_DETAILS_MAX).optional(),
  })
  // D209: ads have their own reasons; the ad-only ones never apply to anything else.
  // D230: events too, with one shared ad reason (an over-the-top AI flyer).
  .refine(
    (r) =>
      r.target.type === 'ad'
        ? (AD_REPORT_REASONS as readonly string[]).includes(r.reason)
        : r.target.type === 'event'
          ? (EVENT_REPORT_REASONS as readonly string[]).includes(r.reason)
          : !r.reason.startsWith('AD_') && !r.reason.startsWith('EVENT_'),
    { path: ['reason'], message: 'That reason doesn’t apply here' },
  );

/** What you see in "My reports". Never the moderator's identity or notes. */
export interface MyReport {
  id: string;
  targetType: 'general' | 'business' | 'comment' | 'user' | 'photo' | 'topic' | 'ad' | 'event';
  /** A short preview of what was reported (or the username). */
  preview: string;
  reason: ReportReason;
  status: 'OPEN' | 'ACTIONED' | 'DISMISSED';
  createdAt: string;
  resolvedAt: string | null;
}

/** D90: Contact us. A support ticket (something's wrong) or a general message. */
export const CONTACT_CATEGORIES = ['SUPPORT', 'GENERAL'] as const;
export const contactSchema = z.strictObject({
  category: z.enum(CONTACT_CATEGORIES),
  subject: z.string().trim().min(3, 'Add a short subject').max(100),
  body: z
    .string()
    .trim()
    .min(10, 'Tell us a bit more')
    .max(2000)
    // eslint-disable-next-line no-control-regex
    .refine((v) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v), 'Invalid characters'),
  /** May a moderator see your account email to reply? Off unless you turn it on. */
  allowReply: z.boolean().default(false),
});
export const contactResolveSchema = z.strictObject({ resolved: z.boolean() });
