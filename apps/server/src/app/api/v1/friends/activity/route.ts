import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { friendActivity } from '@/server/social/friends';
import { socialLimit } from '@/server/social/limits';

export const dynamic = 'force-dynamic';

/**
 * D76 / D89: the friends feed ("@name posted near Avondale"), last 3 days; `q` narrows it to
 * friends whose username starts with it. No post text or coordinates.
 */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  await socialLimit(user.id);
  const params = new URL(req.url).searchParams;
  const before = params.get('before') ?? undefined;
  // D89: search by a friend's username (letters, digits, underscores only).
  const q = z
    .string()
    .regex(/^[A-Za-z0-9_]{1,20}$/)
    .safeParse(params.get('q')?.trim().replace(/^@/, '') ?? '');
  return NextResponse.json(await friendActivity(user.id, before, q.success ? q.data : undefined));
});
