import { NextResponse } from 'next/server';
import { adminMoveBusinessOwnerSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { moveBusinessOwner } from '@/server/admin/businesses';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** B1.7: move a place to another business owner account. Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const placeId = await uuidParam(ctx);
  const input = await parseBody(req, adminMoveBusinessOwnerSchema);
  await adminRateLimit(admin.id);
  await moveBusinessOwner(admin.id, placeId, input);
  return NextResponse.json({ ok: true });
});
