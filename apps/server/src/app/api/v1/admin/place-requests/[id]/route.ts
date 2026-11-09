import { NextResponse } from 'next/server';
import { adminPlaceRequestDecisionSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { decidePlaceRequest } from '@/server/admin/place-requests';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D224 (B6.4): approve or turn down a request from the owner website. Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const input = await parseBody(req, adminPlaceRequestDecisionSchema);
  await adminRateLimit(admin.id);
  return NextResponse.json(await decidePlaceRequest(admin.id, id, input));
});
