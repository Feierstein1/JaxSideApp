import { NextResponse } from 'next/server';
import { adminEndSubscriptionSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { endSubscription } from '@/server/admin/plans';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** B3.1: end a business's current plan now. Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const { note } = await parseBody(req, adminEndSubscriptionSchema);
  await adminRateLimit(admin.id);
  await endSubscription(admin.id, id, note);
  return NextResponse.json({ ok: true });
});
