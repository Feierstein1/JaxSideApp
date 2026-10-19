import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { listFriends } from '@/server/social/friends';
import { socialLimit } from '@/server/social/limits';

export const dynamic = 'force-dynamic';

/** D76: your friends (private to you). */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  await socialLimit(user.id);
  return NextResponse.json({ friends: await listFriends(user.id) });
});
