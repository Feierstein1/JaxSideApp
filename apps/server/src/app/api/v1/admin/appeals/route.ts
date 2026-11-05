import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/admin/auth';
import { pageNumber } from '@/server/admin/paging';
import { listAppeals } from '@/server/admin/users';
import { route } from '@/server/http';

export const dynamic = 'force-dynamic';

/** P5.7 / P5.14: appeals waiting (or decided). */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const sp = new URL(req.url).searchParams;
  const s = sp.get('status');
  const status = s === 'ACCEPTED' || s === 'REJECTED' ? s : 'OPEN';
  const { rows, ...page } = await listAppeals(status, pageNumber(sp.get('page')));
  return NextResponse.json({ appeals: rows, ...page });
});
