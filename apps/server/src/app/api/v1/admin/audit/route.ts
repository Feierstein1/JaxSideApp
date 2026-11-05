import { NextResponse } from 'next/server';
import { listAudit } from '@/server/admin/audit';
import { requireAdmin } from '@/server/admin/auth';
import { pageNumber } from '@/server/admin/paging';
import { route } from '@/server/http';

export const dynamic = 'force-dynamic';

/** P5.16: the admin audit log, newest first. */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const sp = new URL(req.url).searchParams;
  const before = sp.get('before');
  const date = before ? new Date(before) : undefined;
  const { rows, ...page } = await listAudit({
    before: date && !isNaN(date.getTime()) ? date : undefined,
    page: pageNumber(sp.get('page')),
  });
  return NextResponse.json({ entries: rows, ...page });
});
