import { NextResponse } from 'next/server';
import { CASE_TYPES } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { pageNumber } from '@/server/admin/paging';
import { listCases, type CaseType } from '@/server/admin/queue';
import { route } from '@/server/http';

export const dynamic = 'force-dynamic';

/** P5.14: the moderation queue (open reports grouped by item, most urgent first). */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const sp = new URL(req.url).searchParams;
  const type = sp.get('type');
  const valid = type && (CASE_TYPES as readonly string[]).includes(type);
  const { rows, ...page } = await listCases({
    ...(valid ? { type: type as CaseType } : {}),
    page: pageNumber(sp.get('page')),
  });
  return NextResponse.json({ cases: rows, ...page });
});
