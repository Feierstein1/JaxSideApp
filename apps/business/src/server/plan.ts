import type { BusinessAccount } from '@/generated/prisma/client';
import { db } from './db';

/**
 * B3.1: the business's current plan. A plan belongs to the owner account; staff logins
 * work under their owner's. Current = ACTIVE and inside its dates (a promo that ran out
 * is over even before anyone marks it).
 */
export async function currentPlan(
  account: Pick<BusinessAccount, 'id' | 'createdById'>,
  now = new Date(),
) {
  const ownerId = account.createdById ?? account.id;
  const sub = await db.subscription.findFirst({
    where: {
      accountId: ownerId,
      status: 'ACTIVE',
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    include: { plan: true },
  });
  if (!sub) return null;
  return {
    name: sub.plan.name,
    liveAdLimit: sub.plan.liveAdLimit,
    includesInsights: sub.plan.includesInsights,
    priceCents: sub.plan.priceCents,
    comped: sub.comped,
    startsAt: sub.startsAt.toISOString(),
    endsAt: sub.endsAt?.toISOString() ?? null,
  };
}

export type CurrentPlan = NonNullable<Awaited<ReturnType<typeof currentPlan>>>;
