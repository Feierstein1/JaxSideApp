import { NextResponse } from 'next/server';
import { geocodeSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { adminRateLimit } from '@/server/admin/users';
import { geocodeAddress } from '@/server/events/admin';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D230: find a pin for an address (US Census geocoder, D224). `match` is null if not found. */
export const POST = route(async (req) => {
  const { admin } = await requireAdmin(req);
  const { address } = await parseBody(req, geocodeSchema);
  await adminRateLimit(admin.id);
  return NextResponse.json({ match: await geocodeAddress(address) });
});
