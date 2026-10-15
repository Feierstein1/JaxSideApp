import { NextResponse } from 'next/server';
import { emptyBodySchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { addFavorite, removeFavorite } from '@/server/directory/places';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';
import { placeIdFrom, type PlaceRouteCtx as Ctx } from '@/server/directory/route-params';

/**
 * P2.14: save or unsave a place. No location needed: a favorite saves the place,
 * it doesn't grant remote access to its discussion (D19). Always the caller's own list.
 */
async function guard(req: Request, ctx: Ctx) {
  const { user } = await requireUser(req);
  const placeId = await placeIdFrom(ctx);
  await parseBody(req, emptyBodySchema);
  await enforce([
    {
      key: `favorite:user:${user.id}`,
      limitKey: 'rateLimit.favorite.perMinute',
      windowSeconds: 60,
    },
  ]);
  return { userId: user.id, placeId };
}

export const PUT = route<Ctx>(async (req, ctx) => {
  const { userId, placeId } = await guard(req, ctx);
  await addFavorite(userId, placeId);
  return NextResponse.json({ favorite: true });
});

export const DELETE = route<Ctx>(async (req, ctx) => {
  const { userId, placeId } = await guard(req, ctx);
  await removeFavorite(userId, placeId);
  return NextResponse.json({ favorite: false });
});
