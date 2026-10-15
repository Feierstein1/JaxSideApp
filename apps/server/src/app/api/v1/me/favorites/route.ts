import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { listFavorites } from '@/server/directory/places';
import { route } from '@/server/http';

export const dynamic = 'force-dynamic';

/** P2.14: the caller's saved places. Part of account settings, so no location needed (D16). */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  return NextResponse.json({ favorites: await listFavorites(user.id) });
});
