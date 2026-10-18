import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { usernameFrom, type UsernameCtx } from '@/server/profiles';
import { unfriend } from '@/server/social/friends';
import { socialLimit } from '@/server/social/limits';

/** D76: remove a friend. */
export const DELETE = route<UsernameCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const username = await usernameFrom(ctx);
  await socialLimit(user.id);
  await unfriend(user.id, username);
  return NextResponse.json({ ok: true });
});
