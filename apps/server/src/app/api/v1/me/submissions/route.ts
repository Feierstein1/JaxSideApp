import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { listMySubmissions } from '@/server/directory/submissions';
import { route } from '@/server/http';

export const dynamic = 'force-dynamic';

/** P5.8: your suggested places and how they went. */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  return NextResponse.json({ submissions: await listMySubmissions(user.id) });
});
