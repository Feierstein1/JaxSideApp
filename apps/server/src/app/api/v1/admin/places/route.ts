import { NextResponse } from 'next/server';
import { adminPlaceCreateSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { adminRateLimit } from '@/server/admin/users';
import { adminCreatePlace } from '@/server/directory/admin-places';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D146: add a place now (inside Duval), without a suggestion or votes. Audited. */
export const POST = route(async (req) => {
  const { admin } = await requireAdmin(req);
  const input = await parseBody(req, adminPlaceCreateSchema);
  await adminRateLimit(admin.id);
  return NextResponse.json({ placeId: await adminCreatePlace(admin.id, input) }, { status: 201 });
});
