import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { route } from '@/server/http';
import { cancelFriendRequest } from '@/server/social/friends';
import { socialLimit } from '@/server/social/limits';

/** D76: withdraw a request you sent. */
export const DELETE = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const id = await idFrom(ctx);
  await socialLimit(user.id);
  await cancelFriendRequest(user.id, id);
  return NextResponse.json({ ok: true });
});
