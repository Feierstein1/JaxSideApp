import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/admin/auth';
import { adminSummary } from '@/server/admin/summary';
import { route } from '@/server/http';

export const dynamic = 'force-dynamic';

/** P5.11: counts for the admin dashboard. */
export const GET = route(async (req) => {
  await requireAdmin(req);
  return NextResponse.json(await adminSummary());
});
