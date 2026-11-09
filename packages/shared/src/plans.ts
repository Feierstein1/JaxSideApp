import { z } from 'zod';

/**
 * D202: business tiers. A tier (`Plan`) gives a list of entitlements (`PlanEntitlement`
 * rows: a key and a JSON value). This is the one list of keys and their value types, used
 * by the app server, the admin portal and the owner website (which copies this file).
 * Add a key here before using it; unknown or malformed rows are ignored when read.
 */

/** Fixed tier codes the code relies on (display names can change). */
export const PLAN_CODES = ['FREE', 'STANDARD', 'PREMIUM'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

/** The free month every new business gets once (one per business and per place). */
export const FREE_TIER_DAYS = 30;

/** D204: where an ad may show: the place's own ZIP, chosen ZIPs, or the whole city. */
export const AD_REACH = ['OWN_ZIP', 'ZIPS', 'CITY'] as const;
/** D204: which ZIPs Insights covers: the place's own, its own and nearby ones, or all. */
export const INSIGHTS_REACH = ['OWN_ZIP', 'NEARBY', 'ALL'] as const;

export const PLAN_ENTITLEMENTS = {
  /** Ads live at once (D167; D204: up to 5). */
  'ads.live': z.number().int().min(0).max(5),
  /** D204: ads saved in the library (drafts and past ones count). */
  'ads.library': z.number().int().min(0).max(20),
  /** D204: where its ads may show (OWN_ZIP: set by the website, not the owner). */
  'ads.reach': z.enum(AD_REACH),
  /** D204: ZIP codes an ad may pick (for ZIPS). */
  'ads.maxZips': z.number().int().min(1).max(30),
  /** D204: the longest an ad may run, in days; null = no limit. */
  'ads.maxDays': z.number().int().min(1).max(365).nullable(),
  /** D216: an ad may carry one link button (paid plans). */
  'ads.links': z.boolean(),
  /** Area counts for the place (Q29 / D179). */
  insights: z.boolean(),
  /** D204: which ZIPs Insights covers. */
  'insights.reach': z.enum(INSIGHTS_REACH),
  /** D204: ZIPs beside the place's own (for NEARBY). */
  'insights.nearbyZips': z.number().int().min(0).max(30),
} as const;

export type PlanEntitlementKey = keyof typeof PLAN_ENTITLEMENTS;
export type PlanEntitlements = {
  [K in PlanEntitlementKey]?: z.infer<(typeof PLAN_ENTITLEMENTS)[K]>;
};

/** What a business without a current plan gets. */
export const NO_PLAN_ENTITLEMENTS: Required<PlanEntitlements> = {
  'ads.live': 0,
  'ads.library': 0,
  'ads.reach': 'OWN_ZIP',
  'ads.maxZips': 1,
  'ads.maxDays': 7,
  'ads.links': false,
  insights: false,
  'insights.reach': 'OWN_ZIP',
  'insights.nearbyZips': 0,
};

export const isPlanEntitlementKey = (key: string): key is PlanEntitlementKey =>
  Object.hasOwn(PLAN_ENTITLEMENTS, key);

/**
 * A tier's rows as one object, e.g. `{ "ads.live": 3, "insights": true }`. Rows with an
 * unknown key or a value of the wrong type are left out (so a typo never grants anything).
 */
export function planEntitlements(rows: { key: string; value: unknown }[]): PlanEntitlements {
  const out: Record<string, unknown> = {};
  for (const { key, value } of rows) {
    if (!isPlanEntitlementKey(key)) continue;
    const parsed = PLAN_ENTITLEMENTS[key].safeParse(value);
    if (parsed.success) out[key] = parsed.data;
  }
  return out as PlanEntitlements;
}

/** One entitlement as the admin (or a seed) writes it: refuses unknown keys and bad values. */
export const planEntitlementInputSchema = z
  .strictObject({ key: z.string(), value: z.unknown() })
  .superRefine((e, ctx) => {
    if (!isPlanEntitlementKey(e.key)) {
      ctx.addIssue({ code: 'custom', path: ['key'], message: 'Unknown entitlement' });
      return;
    }
    if (!PLAN_ENTITLEMENTS[e.key].safeParse(e.value).success) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Wrong value for this entitlement',
      });
    }
  });
