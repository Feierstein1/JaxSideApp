import { FREE_TIER_DAYS, type PlanCode, type PlanEntitlements } from '@jax/shared';
import { Prisma, type PrismaClient } from '../generated/prisma/client';

/**
 * D202: the starter tiers. Created by the seed when missing (a plan with the same name is
 * adopted and given its code); never overwritten, so the admin's later changes stay. What
 * each tier gives is the owner's list (D204). Prices stay empty until decided (Q28).
 */
export const STARTER_TIERS: {
  code: PlanCode;
  name: string;
  rank: number;
  durationDays: number | null;
  entitlements: Required<PlanEntitlements>;
}[] = [
  // D204 (owner, 2026-11-05).
  {
    code: 'FREE',
    name: 'Free',
    rank: 1,
    durationDays: FREE_TIER_DAYS,
    entitlements: {
      'ads.live': 1,
      'ads.library': 3,
      'ads.reach': 'OWN_ZIP',
      'ads.maxZips': 1,
      'ads.maxDays': 7,
      'ads.links': false, // D216: paid plans only
      insights: true,
      'insights.reach': 'OWN_ZIP',
      'insights.nearbyZips': 0,
    },
  },
  {
    code: 'STANDARD',
    name: 'Standard',
    rank: 2,
    durationDays: null,
    entitlements: {
      'ads.live': 3,
      'ads.library': 20,
      'ads.reach': 'ZIPS',
      'ads.maxZips': 3,
      'ads.maxDays': null,
      'ads.links': true,
      insights: true,
      'insights.reach': 'NEARBY',
      'insights.nearbyZips': 4,
    },
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    rank: 3,
    durationDays: null,
    entitlements: {
      'ads.live': 5,
      'ads.library': 20,
      'ads.reach': 'CITY',
      'ads.maxZips': 30,
      'ads.maxDays': null,
      'ads.links': true,
      insights: true,
      'insights.reach': 'ALL',
      'insights.nearbyZips': 0,
    },
  },
];

export async function ensureTiers(client: PrismaClient) {
  for (const t of STARTER_TIERS) {
    const existing =
      (await client.plan.findUnique({ where: { code: t.code } })) ??
      (await client.plan.findUnique({ where: { name: t.name } }));
    if (existing) {
      if (!existing.code) {
        await client.plan.update({
          where: { id: existing.id },
          data: { code: t.code, rank: t.rank, durationDays: t.durationDays },
        });
      }
      continue;
    }
    await client.plan.create({
      data: {
        code: t.code,
        name: t.name,
        rank: t.rank,
        durationDays: t.durationDays,
        // The old columns stay in step until the website reads entitlements (D202).
        liveAdLimit: t.entitlements['ads.live'],
        includesInsights: t.entitlements.insights,
        prices: { create: { amountCents: null, interval: 'MONTH' } },
        entitlements: {
          // A JSON null (e.g. no day limit) needs Prisma's marker, not a plain null.
          create: Object.entries(t.entitlements).map(([key, value]) => ({
            key,
            value: value === null ? Prisma.JsonNull : value,
          })),
        },
      },
    });
  }
}
