import { NextResponse } from 'next/server';
import { placeRatingsAdminSchema } from '@jax/shared';
import { audit } from '@/server/admin/audit';
import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { adminPlaceRatings } from '@/server/directory/ratings';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D144: lock or unlock voting on a place, or clear all its votes (abuse). Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const placeId = await uuidParam(ctx);
  const input = await parseBody(req, placeRatingsAdminSchema);
  await adminRateLimit(admin.id);
  await adminPlaceRatings(placeId, input.action);
  await audit(
    admin.id,
    `PLACE_RATINGS_${input.action.toUpperCase()}`,
    { type: 'place', id: placeId },
    { reason: input.reason },
  );
  return NextResponse.json({ ok: true });
});
