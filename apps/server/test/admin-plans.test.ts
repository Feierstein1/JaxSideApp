import { beforeEach, describe, expect, it } from 'vitest';
import { POST as compPOST } from '@/app/api/v1/admin/businesses/[id]/subscription/route';
import { POST as endPOST } from '@/app/api/v1/admin/businesses/[id]/subscription/end/route';
import { POST as updatePOST } from '@/app/api/v1/admin/plans/[id]/route';
import { POST as createPOST } from '@/app/api/v1/admin/plans/route';
import { listPlans } from '@/server/admin/plans';
import { createSession } from '@/server/auth/sessions';
import { db } from '@/server/db';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// B3.1 / D168: plans as data; the admin gives them for free until payments exist.

let admin: Record<string, string>;
let owner: { id: string };
const PLAN = {
  name: 'Starter',
  liveAdLimit: 1,
  priceCents: null,
  includesInsights: false,
  active: true,
};
const createPlan = (body: object) => call(createPOST as H, 'POST', { headers: admin, body });
const comp = (id: string, body: object) =>
  call(compPOST as H, 'POST', { headers: admin, params: { id }, body });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  admin = await adminHeaders((await createTestUser('mod_p', { role: 'ADMIN' })).id);
  owner = await db.businessAccount.create({
    data: { email: 'owner@boldbean.com', passwordHash: 'x' },
  });
});

describe('B3.1 plans', () => {
  it('creates and edits plans as data, any number of tiers, at most 5 ads at once (D204)', async () => {
    expect((await createPlan(PLAN)).status).toBe(201);
    const pro = await createPlan({
      ...PLAN,
      name: 'Pro',
      liveAdLimit: 3,
      priceCents: 7900,
      includesInsights: true,
    });
    expect(pro.status).toBe(201);
    expect((await createPlan({ ...PLAN, name: 'Huge', liveAdLimit: 6 })).status).toBe(400);
    expect((await createPlan(PLAN)).status).toBe(409); // same name
    const r = await call(updatePOST as H, 'POST', {
      headers: admin,
      params: { id: pro.body.id },
      body: {
        ...PLAN,
        name: 'Pro',
        liveAdLimit: 2,
        priceCents: 4900,
        includesInsights: true,
        active: false,
      },
    });
    expect(r.status).toBe(200);
    const plans = await listPlans();
    expect(plans.map((p) => [p.name, p.liveAdLimit, p.priceCents, p.active])).toEqual([
      ['Starter', 1, null, true],
      ['Pro', 2, 4900, false],
    ]);
    expect(
      await db.adminAuditLog.count({ where: { action: { in: ['PLAN_CREATE', 'PLAN_UPDATE'] } } }),
    ).toBe(3);
  });

  it('🔒 only an admin session; a phone-app token is refused', async () => {
    const u = await createTestUser('ann_p', { emailVerifiedAt: new Date() });
    const token = (await createSession(u.id, 'MOBILE')).token;
    expect((await call(createPOST as H, 'POST', { token, body: PLAN })).status).toBe(401);
    expect(await db.plan.count()).toBe(0);
  });
});

describe('B3.1 free plans for businesses', () => {
  it('gives a plan, replacing the current one, and tells the business', async () => {
    const starter = (await createPlan(PLAN)).body.id;
    const pro = (await createPlan({ ...PLAN, name: 'Pro', liveAdLimit: 3 })).body.id;
    expect((await comp(owner.id, { planId: starter, note: 'friend of the owner' })).status).toBe(
      201,
    );
    const until = new Date(Date.now() + 30 * 86_400_000).toISOString();
    expect((await comp(owner.id, { planId: pro, endsAt: until })).status).toBe(201);

    const subs = await db.subscription.findMany({
      orderBy: { createdAt: 'asc' },
      include: { plan: true },
    });
    expect(subs.map((s) => [s.plan.name, s.status, s.comped])).toEqual([
      ['Starter', 'CANCELLED', true],
      ['Pro', 'ACTIVE', true],
    ]);
    expect(subs[1]!.endsAt?.toISOString()).toBe(until);
    const notices = await db.businessNotice.findMany({
      where: { accountId: owner.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(notices.map((n) => n.title)).toEqual([
      'You’re on the Starter plan',
      'You’re on the Pro plan',
    ]);
    expect(await db.adminAuditLog.count({ where: { action: 'SUBSCRIPTION_COMP' } })).toBe(2);
  });

  it('ends a plan; refuses staff logins, past end dates and unknown plans', async () => {
    const starter = (await createPlan(PLAN)).body.id;
    const staff = await db.businessAccount.create({
      data: { username: 'sam.bb', passwordHash: 'x', createdById: owner.id },
    });
    expect((await comp(staff.id, { planId: starter })).status).toBe(404); // plans belong to the owner
    expect((await comp(owner.id, { planId: starter, endsAt: '2020-01-01T00:00:00Z' })).status).toBe(
      400,
    );
    expect((await comp(owner.id, { planId: '00000000-0000-7000-8000-000000000000' })).status).toBe(
      404,
    );

    await comp(owner.id, { planId: starter });
    const end = () =>
      call(endPOST as H, 'POST', { headers: admin, params: { id: owner.id }, body: {} });
    expect((await end()).status).toBe(200);
    expect(await db.subscription.count({ where: { status: 'ACTIVE' } })).toBe(0);
    expect((await end()).status).toBe(409); // nothing left to end
  });
});
