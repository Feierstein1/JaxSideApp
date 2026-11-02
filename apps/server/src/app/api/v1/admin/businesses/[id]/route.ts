import { NextResponse } from 'next/server';
import { adminBusinessActionSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { actOnBusiness } from '@/server/admin/businesses';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** B1.7: suspend, lift, revoke or reset the password of a business login. Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const { action, note } = await parseBody(req, adminBusinessActionSchema);
  await adminRateLimit(admin.id);
  return NextResponse.json(await actOnBusiness(admin.id, id, action, note));
});
