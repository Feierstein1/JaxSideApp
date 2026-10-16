import { NextResponse } from 'next/server';
import { listAudit } from '@/server/admin/audit';
import { requireAdmin } from '@/server/admin/auth';
import { route } from '@/server/http';

export const dynamic = 'force-dynamic';

/** P5.16: the admin audit log, newest first. */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const before = new URL(req.url).searchParams.get('before');
  const date = before ? new Date(before) : undefined;
  return NextResponse.json({
    entries: await listAudit({ before: date && !isNaN(date.getTime()) ? date : undefined }),
  });
});
