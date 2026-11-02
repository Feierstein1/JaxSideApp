import { NextResponse } from 'next/server';
import { adminPlanSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { createPlan } from '@/server/admin/plans';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** B3.1: a new subscription plan. Audited. */
export const POST = route(async (req) => {
  const { admin } = await requireAdmin(req);
  const input = await parseBody(req, adminPlanSchema);
  await adminRateLimit(admin.id);
  const plan = await createPlan(admin.id, input);
  return NextResponse.json({ id: plan.id }, { status: 201 });
});
