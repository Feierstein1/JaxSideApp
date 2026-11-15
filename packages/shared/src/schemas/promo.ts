import { z } from 'zod';
import { BOOST_DAYS, PLAN_CODES } from '../plans';

/**
 * D248: promo codes (businesses only). A code gives a plan for some days, at most `maxUses`
 * times in all; one code per account, ever. Codes are stored upper-case.
 */
export const PROMO_CODE_RE = /^[A-Z0-9-]{4,24}$/;
export const promoCodeText = z
  .string()
  .trim()
  .transform((c) => c.toUpperCase())
  .pipe(z.string().regex(PROMO_CODE_RE, 'Codes are 4-24 letters, numbers or dashes'));

/** What the website sends when a business types a code ("Have a code?"). */
export const promoRedeemSchema = z.strictObject({ code: promoCodeText });

/** An admin makes a code. */
export const adminPromoCodeSchema = z.strictObject({
  code: promoCodeText,
  plan: z.enum(PLAN_CODES),
  days: z.int().min(1).max(366),
  maxUses: z.int().min(1).max(10_000),
  expiresAt: z.iso.datetime({ offset: true }).nullable().default(null),
  note: z.string().trim().max(300).optional(),
});
export type AdminPromoCodeInput = z.input<typeof adminPromoCodeSchema>;

/** An admin turns a code off (or back on). */
export const adminPromoActiveSchema = z.strictObject({ active: z.boolean() });

/** D248: a business boosts one ad or one event for a few days (plan allowance per month). */
export const boostStartSchema = z
  .strictObject({
    adId: z.uuid().optional(),
    eventId: z.uuid().optional(),
    days: z
      .int()
      .refine((d) => (BOOST_DAYS as readonly number[]).includes(d), 'Pick 3, 7 or 14 days'),
  })
  .refine((b) => !!b.adId !== !!b.eventId, {
    path: ['adId'],
    message: 'Boost one ad or one event',
  });
export type BoostStartInput = z.input<typeof boostStartSchema>;
