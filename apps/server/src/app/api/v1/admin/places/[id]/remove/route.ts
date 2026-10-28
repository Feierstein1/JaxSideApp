import { NextResponse } from 'next/server';
import { adminPlaceRemoveSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { adminRemoveAnyPlace } from '@/server/directory/admin-places';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D146: take any place down now (no request needed). Keep in Removals undoes it. Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const placeId = await uuidParam(ctx);
  const { reason } = await parseBody(req, adminPlaceRemoveSchema);
  await adminRateLimit(admin.id);
  await adminRemoveAnyPlace(admin.id, placeId, reason);
  return NextResponse.json({ ok: true });
});
