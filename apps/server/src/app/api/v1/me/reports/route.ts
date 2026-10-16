import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { listMyReports } from '@/server/reports';

export const dynamic = 'force-dynamic';

/** P4.11 / P5.1: the reports you've sent and their status. */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  return NextResponse.json({ reports: await listMyReports(user.id) });
});
