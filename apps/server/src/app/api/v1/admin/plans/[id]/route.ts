import { NextResponse } from 'next/server';
import { adminPlanSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { updatePlan } from '@/server/admin/plans';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** B3.1: change a plan (applies to everyone on it). Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const input = await parseBody(req, adminPlanSchema);
  await adminRateLimit(admin.id);
  await updatePlan(admin.id, id, input);
  return NextResponse.json({ ok: true });
});
