import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { friendActivity } from '@/server/social/friends';
import { socialLimit } from '@/server/social/limits';

export const dynamic = 'force-dynamic';

/** D76: the friends feed ("@name posted near Avondale"). No post text or coordinates. */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  await socialLimit(user.id);
  const before = new URL(req.url).searchParams.get('before') ?? undefined;
  return NextResponse.json(await friendActivity(user.id, before));
});
