import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/admin/auth';
import { searchUsers } from '@/server/admin/users';
import { route } from '@/server/http';

export const dynamic = 'force-dynamic';

/** P5.14: find a person by username (prefix). */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, 40);
  return NextResponse.json({ users: await searchUsers(q) });
});
