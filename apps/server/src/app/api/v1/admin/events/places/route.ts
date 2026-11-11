import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/admin/auth';
import { adminRateLimit } from '@/server/admin/users';
import { adminSearchPlaces } from '@/server/directory/admin-places';
import { route } from '@/server/http';

/** D230: places to hold an event at (active ones only), for the event form's place picker. */
export const GET = route(async (req) => {
  const { admin } = await requireAdmin(req);
  await adminRateLimit(admin.id);
  const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, 60);
  const page = await adminSearchPlaces(q);
  return NextResponse.json({
    places: page.rows
      .filter((p) => p.status === 'ACTIVE')
      .map((p) => ({ id: p.id, name: p.name, category: p.category, address: p.address })),
  });
});
