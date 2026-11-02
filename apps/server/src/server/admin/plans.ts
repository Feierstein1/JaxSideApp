import { db } from '../db';
import { ApiError } from '../http';
import { audit } from './audit';

/**
 * B3.1 / D168: subscription plans are data the admin edits (any number of tiers; prices
 * stay open, Q28). Until payments exist (B4), a business gets a plan only when the admin
 * gives one for free ("comped", a promo period). A business has at most one active plan.
 */

export type PlanInput = {
  name: string;
  liveAdLimit: number;
  priceCents: number | null;
  includesInsights: boolean;
  active: boolean;
};

export async function listPlans() {
  const plans = await db.plan.findMany({
    orderBy: [{ active: 'desc' }, { liveAdLimit: 'asc' }, { name: 'asc' }],
    include: {
      _count: { select: { subscriptions: { where: { status: 'ACTIVE' } } } },
    },
  });
  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    liveAdLimit: p.liveAdLimit,
    priceCents: p.priceCents,
    includesInsights: p.includesInsights,
    active: p.active,
    activeSubscriptions: p._count.subscriptions,
  }));
}

const nameTaken = (err: unknown) => {
  if ((err as { code?: string })?.code === 'P2002') {
    throw new ApiError(409, 'NAME_TAKEN', 'A plan with that name already exists.');
  }
  throw err;
};

export async function createPlan(adminId: string, input: PlanInput) {
  const plan = await db.plan.create({ data: input }).catch(nameTaken);
  await audit(adminId, 'PLAN_CREATE', { type: 'plan', id: plan.id }, { ...input });
  return plan;
}

/** Changes apply to everyone on the plan (their limits come from the plan, not a copy). */
export async function updatePlan(adminId: string, id: string, input: PlanInput) {
  const exists = await db.plan.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new ApiError(404, 'NOT_FOUND', 'Plan not found');
  const plan = await db.plan.update({ where: { id }, data: input }).catch(nameTaken);
  await audit(adminId, 'PLAN_UPDATE', { type: 'plan', id }, { ...input });
  return plan;
}

/** Only owner accounts hold plans (staff logins work under their owner's). */
async function ownerAccount(accountId: string) {
  const a = await db.businessAccount.findUnique({ where: { id: accountId } });
  if (!a || a.createdById || a.revokedAt) {
    throw new ApiError(404, 'NOT_FOUND', 'Owner account not found');
  }
  return a;
}

/**
 * Gives a business a plan for free. Its current plan (if any) ends now, so it always has
 * at most one. Starts now unless a start is given; open-ended unless an end is given.
 */
export async function compPlan(
  adminId: string,
  accountId: string,
  input: { planId: string; startsAt?: string; endsAt?: string | null; note?: string },
  now = new Date(),
) {
  await ownerAccount(accountId);
  const plan = await db.plan.findUnique({ where: { id: input.planId } });
  if (!plan) throw new ApiError(404, 'NOT_FOUND', 'Plan not found');
  const startsAt = input.startsAt ? new Date(input.startsAt) : now;
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (endsAt && endsAt <= now) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'The end date has already passed.');
  }
  const sub = await db.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { accountId, status: 'ACTIVE' },
      data: { status: 'CANCELLED', endsAt: now },
    });
    const sub = await tx.subscription.create({
      data: {
        accountId,
        planId: plan.id,
        status: 'ACTIVE',
        startsAt,
        endsAt,
        comped: true,
        grantedByAdminId: adminId,
        note: input.note ?? null,
        createdAt: now,
      },
    });
    await tx.businessNotice.create({
      data: {
        accountId,
        kind: 'FROM_JAXSIDE',
        title: `You’re on the ${plan.name} plan`,
        body: endsAt
          ? `Free from JaxSide until ${endsAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })}.`
          : 'Free from JaxSide.',
        createdAt: now,
      },
    });
    await audit(
      adminId,
      'SUBSCRIPTION_COMP',
      { type: 'business-account', id: accountId },
      {
        plan: plan.name,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt?.toISOString() ?? null,
        ...(input.note ? { note: input.note } : {}),
      },
      tx,
    );
    return sub;
  });
  return sub;
}

/** Ends the business's current plan now (its live ads stop counting toward nothing; B3). */
export async function endSubscription(
  adminId: string,
  accountId: string,
  note: string | undefined,
  now = new Date(),
) {
  await ownerAccount(accountId);
  const res = await db.subscription.updateMany({
    where: { accountId, status: 'ACTIVE' },
    data: { status: 'CANCELLED', endsAt: now },
  });
  if (res.count === 0) throw new ApiError(409, 'NO_PLAN', 'This business has no current plan.');
  await audit(
    adminId,
    'SUBSCRIPTION_END',
    { type: 'business-account', id: accountId },
    note ? { note } : undefined,
  );
}
