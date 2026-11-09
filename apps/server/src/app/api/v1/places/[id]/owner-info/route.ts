import { NextResponse } from 'next/server';
import { requireActor } from '@/server/auth/require-actor';
import { db } from '@/server/db';
import { placeIdFrom, type PlaceRouteCtx as Ctx } from '@/server/directory/route-params';
import { getEnv } from '@/server/env';
import { ApiError, route } from '@/server/http';

/**
 * B6.5 / D224: the app's "I own this place" screen. Owners don't verify in the app any more
 * (D185): they sign up on the JaxSide for Business website. This says whether the place
 * already has a verified owner (never who) and where the website is (null until it's public).
 */
export const GET = route<Ctx>(async (req, ctx) => {
  await requireActor(req);
  const placeId = await placeIdFrom(ctx);
  const place = await db.businessPlace.findFirst({
    where: { id: placeId, status: 'ACTIVE' },
    select: { name: true },
  });
  if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found');
  const owner = await db.businessPlaceAccess.findFirst({
    where: { placeId, role: 'OWNER', revokedAt: null },
    select: { id: true },
  });
  const site = getEnv().BUSINESS_SITE_URL;
  return NextResponse.json({
    placeName: place.name,
    hasVerifiedOwner: !!owner,
    // The website's sign-up page (B6.3); null until the website is public.
    signupUrl: site ? new URL('/signup', site).toString() : null,
  });
});
