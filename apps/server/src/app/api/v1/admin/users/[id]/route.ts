import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { getUserRecord } from '@/server/admin/users';
import { route } from '@/server/http';

export const dynamic = 'force-dynamic';

/** P5.14: a person's record: status, history, recent content (never their email). */
export const GET = route<IdParams>(async (req, ctx) => {
  await requireAdmin(req);
  return NextResponse.json(await getUserRecord(await uuidParam(ctx)));
});
