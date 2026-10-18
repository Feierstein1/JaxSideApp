import { NextResponse } from 'next/server';
import { emptyBodySchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { route } from '@/server/http';
import { answerFriendRequest } from '@/server/social/friends';
import { socialLimit } from '@/server/social/limits';
import { parseBody } from '@/server/validate';

/** D76: accept a friend request sent to you. Only the person asked can answer it. */
export const POST = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const id = await idFrom(ctx);
  await parseBody(req, emptyBodySchema);
  await socialLimit(user.id);
  await answerFriendRequest(user.id, id, true);
  return NextResponse.json({ ok: true });
});
