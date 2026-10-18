import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { route } from '@/server/http';
import { friendsWhoFavorited } from '@/server/social/friends';
import { socialLimit } from '@/server/social/limits';

export const dynamic = 'force-dynamic';

/** D74/D76: which of your friends favorited this place (everyone else sees only the count). */
export const GET = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const id = await idFrom(ctx);
  await socialLimit(user.id);
  return NextResponse.json({ friends: await friendsWhoFavorited(user.id, id) });
});
