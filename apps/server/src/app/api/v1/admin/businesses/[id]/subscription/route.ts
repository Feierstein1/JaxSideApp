import { NextResponse } from 'next/server';
import { adminCompSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { compPlan } from '@/server/admin/plans';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** B3.1: give a business a plan for free (replaces its current one). Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const input = await parseBody(req, adminCompSchema);
  await adminRateLimit(admin.id);
  const sub = await compPlan(admin.id, id, input);
  return NextResponse.json({ id: sub.id }, { status: 201 });
});
