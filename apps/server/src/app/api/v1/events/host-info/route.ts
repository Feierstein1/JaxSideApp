import { NextResponse } from 'next/server';
import { requireActor } from '@/server/auth/require-actor';
import { getEnv } from '@/server/env';
import { route } from '@/server/http';

/**
 * D233: the app's "Post an event" screen. App users don't suggest events: hosts add them on
 * the JaxSide for Business website (D230 / D232). This only says where its sign-up page is
 * (null until the website is public).
 */
export const GET = route(async (req) => {
  await requireActor(req);
  const site = getEnv().BUSINESS_SITE_URL;
  return NextResponse.json({ signupUrl: site ? new URL('/signup', site).toString() : null });
});
