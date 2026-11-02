import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { currentPlan } from '@/server/plan';
import { makeAccount, resetBusinessData } from './helpers';

// B3.1: the business's current plan, as the website reads it.

const DAY = 86_400_000;
let owner: Awaited<ReturnType<typeof makeAccount>>;
let planId: string;

beforeEach(async () => {
  await resetBusinessData();
  owner = await makeAccount();
  planId = (await db.plan.create({ data: { name: 'Pro', liveAdLimit: 3, includesInsights: true } }))
    .id;
});

describe('B3.1 current plan', () => {
  it('none until one is given; then its limits', async () => {
    expect(await currentPlan(owner)).toBeNull();
    await db.subscription.create({
      data: { accountId: owner.id, planId, startsAt: new Date(Date.now() - DAY), comped: true },
    });
    expect(await currentPlan(owner)).toMatchObject({
      name: 'Pro',
      liveAdLimit: 3,
      includesInsights: true,
      comped: true,
      endsAt: null,
    });
  });

  it('staff logins use their owner’s plan', async () => {
    await db.subscription.create({
      data: { accountId: owner.id, planId, startsAt: new Date(Date.now() - DAY) },
    });
    const staff = await db.businessAccount.create({
      data: { username: 'sam.bb', passwordHash: 'x', createdById: owner.id },
    });
    expect((await currentPlan(staff))?.name).toBe('Pro');
  });

  it('a promo that ran out, or one that hasn’t started, is no plan', async () => {
    await db.subscription.create({
      data: {
        accountId: owner.id,
        planId,
        startsAt: new Date(Date.now() - 10 * DAY),
        endsAt: new Date(Date.now() - DAY),
      },
    });
    expect(await currentPlan(owner)).toBeNull();
    await db.subscription.deleteMany();
    await db.subscription.create({
      data: { accountId: owner.id, planId, startsAt: new Date(Date.now() + DAY) },
    });
    expect(await currentPlan(owner)).toBeNull();
  });
});
