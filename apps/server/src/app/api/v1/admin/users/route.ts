import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/admin/auth';
import { listUsers, parseUserQuery } from '@/server/admin/users';
import { route } from '@/server/http';

export const dynamic = 'force-dynamic';

/** P5.14: find people by any part of the username; filter by strikes, banned, suspended. */
export const GET = route(async (req) => {
  await requireAdmin(req);
  return NextResponse.json(await listUsers(parseUserQuery(new URL(req.url).searchParams)));
});
