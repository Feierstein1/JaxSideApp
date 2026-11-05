import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/admin/auth';
import { pageNumber } from '@/server/admin/paging';
import { listSubmissions, submitterHistory } from '@/server/directory/submissions';
import { route } from '@/server/http';

export const dynamic = 'force-dynamic';

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'DUPLICATE', 'MERGED'] as const;

/** P5.12: the submission queue with filters, duplicate candidates and submitter history. */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const q = new URL(req.url).searchParams;
  const status = STATUSES.find((s) => s === q.get('status')) ?? 'PENDING';
  const since = q.get('since') ? new Date(q.get('since')!) : undefined;
  const { rows: submissions, ...page } = await listSubmissions({
    status,
    category: q.get('category')?.slice(0, 60) || undefined,
    submitter: q.get('submitter')?.slice(0, 20) || undefined,
    since: since && !isNaN(since.getTime()) ? since : undefined,
    page: pageNumber(q.get('page')),
  });
  const history = await submitterHistory([...new Set(submissions.map((s) => s.submitter.id))]);
  return NextResponse.json({ submissions, history, ...page });
});
