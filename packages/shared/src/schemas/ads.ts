import { z } from 'zod';
import { AD_LIVE_MAX, AD_TEMPLATES, checkAdText, type AdTemplateKind } from '../ads';

/**
 * B3.2: what the ad editor sends. A draft may be unfinished (it's saved as the owner
 * goes); `adSubmitProblems` says what's still missing before it can go to JaxSide for
 * approval. Limits per template come from `AD_TEMPLATES` (D177).
 */

const MAX_HEADLINE = Math.max(...Object.values(AD_TEMPLATES).map((t) => t.headlineMax));
const MAX_BODY = Math.max(...Object.values(AD_TEMPLATES).map((t) => t.bodyMax));

/** Five-digit ZIP code (the server checks it's one of the area's). */
export const zipSchema = z.string().regex(/^\d{5}$/, 'A ZIP code is 5 digits');

export const AD_RADIUS_MIN = 100;
export const AD_RADIUS_MAX = 50_000;
export const AD_ZIPS_MAX = 30;

export const adDraftSchema = z
  .strictObject({
    placeId: z.uuid(),
    template: z.enum(['BANNER', 'POST', 'FEATURE']),
    headline: z.string().trim().max(MAX_HEADLINE),
    body: z.string().trim().max(MAX_BODY).nullable().default(null),
    mediaId: z.uuid().nullable().default(null),
    /** Q30: an alcohol deal (the app adds a "21+" line). */
    adultsOnly: z.boolean().default(false),
    startsAt: z.iso.datetime({ offset: true }).nullable().default(null),
    endsAt: z.iso.datetime({ offset: true }).nullable().default(null),
    daysOfWeek: z.number().int().min(1, 'Pick at least one day').max(127).default(127),
    dailyStartMin: z.number().int().min(0).max(1439).nullable().default(null),
    dailyEndMin: z.number().int().min(1).max(1440).nullable().default(null),
    radiusMeters: z.number().int().min(AD_RADIUS_MIN).max(AD_RADIUS_MAX).nullable().default(null),
    zips: z
      .array(zipSchema)
      .max(AD_ZIPS_MAX, `Pick at most ${AD_ZIPS_MAX} ZIP codes`)
      .default([])
      .refine((z) => new Set(z).size === z.length, 'Each ZIP code once'),
  })
  .superRefine((ad, ctx) => {
    if ((ad.dailyStartMin === null) !== (ad.dailyEndMin === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['dailyEndMin'],
        message: 'Set both a start and an end time, or neither (all day)',
      });
    } else if (ad.dailyStartMin !== null && ad.dailyStartMin === ad.dailyEndMin) {
      ctx.addIssue({
        code: 'custom',
        path: ['dailyEndMin'],
        message: 'The end time must differ from the start',
      });
    }
    if (ad.startsAt && ad.endsAt && new Date(ad.endsAt) <= new Date(ad.startsAt)) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'The end must be after the start',
      });
    }
  });

export type AdDraftInput = z.input<typeof adDraftSchema>;
export type AdDraft = z.output<typeof adDraftSchema>;

/**
 * What's still missing before an ad can be sent for approval, in plain words (empty =
 * ready). Shape checks are in `adDraftSchema`; these are the "is it finished" checks.
 */
export function adSubmitProblems(ad: AdDraft, now: Date): string[] {
  const t = AD_TEMPLATES[ad.template as AdTemplateKind];
  const problems = checkAdText(ad.template, { headline: ad.headline, body: ad.body });
  if (t.image.required && !ad.mediaId) {
    problems.push(`A ${t.label.toLowerCase()} needs a picture or GIF.`);
  }
  if (ad.radiusMeters === null && ad.zips.length === 0) {
    problems.push('Choose who sees it: a distance around your place, ZIP codes, or both.');
  }
  if (ad.endsAt && new Date(ad.endsAt) <= now) {
    problems.push('The end date has already passed.');
  }
  return problems;
}

/** The plan check, in plain words (D167, Q35: live and scheduled ads take a slot). */
export function planLimitProblem(liveOrScheduled: number, planLimit: number): string | null {
  const limit = Math.min(planLimit, AD_LIVE_MAX);
  if (limit === 0) return 'Your plan doesn’t include ads.';
  if (liveOrScheduled < limit) return null;
  return limit === 1
    ? 'Your plan runs 1 ad at a time. Pause or end the live one first.'
    : `Your plan runs ${limit} ads at a time. Pause or end one first.`;
}

/** B3.2: the Owner's moves on an ad (withdraw from review, pause, resume, end). */
export const adMoveSchema = z.strictObject({
  move: z.enum(['withdraw', 'pause', 'resume', 'end']),
});

export const adDeleteSchema = z.strictObject({});
