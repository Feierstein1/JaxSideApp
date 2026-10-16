import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/admin/auth';
import { listAppeals } from '@/server/admin/users';
import { route } from '@/server/http';

export const dynamic = 'force-dynamic';

/** P5.7 / P5.14: appeals waiting (or decided). */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const s = new URL(req.url).searchParams.get('status');
  const status = s === 'ACCEPTED' || s === 'REJECTED' ? s : 'OPEN';
  return NextResponse.json({ appeals: await listAppeals(status) });
});
