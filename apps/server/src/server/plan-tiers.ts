import { FREE_TIER_DAYS, type PlanCode, type PlanEntitlements } from '@jax/shared';
import type { PrismaClient } from '../generated/prisma/client';

/**
 * D202: the starter tiers. Created by the seed when missing (a plan with the same name is
 * adopted and given its code); never overwritten, so the admin's later changes stay. What
 * each tier gives is a first guess for the owner to change: Free starts like Standard.
 * Prices stay empty until decided (Q28).
 */
export const STARTER_TIERS: {
  code: PlanCode;
  name: string;
  rank: number;
  durationDays: number | null;
  entitlements: Required<PlanEntitlements>;
}[] = [
  {
    code: 'FREE',
    name: 'Free',
    rank: 1,
    durationDays: FREE_TIER_DAYS,
    entitlements: { 'ads.live': 1, insights: false },
  },
  {
    code: 'STANDARD',
    name: 'Standard',
    rank: 2,
    durationDays: null,
    entitlements: { 'ads.live': 1, insights: false },
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    rank: 3,
    durationDays: null,
    entitlements: { 'ads.live': 3, insights: true },
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
          create: Object.entries(t.entitlements).map(([key, value]) => ({ key, value })),
        },
      },
    });
  }
}
