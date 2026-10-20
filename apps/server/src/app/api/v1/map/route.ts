import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { MAP_BOUNDS, signedMapUrl, tilesAvailable } from '@/server/map/tiles';

export const dynamic = 'force-dynamic';

/** D99: where the app loads the Places map from (signed links, about a day). */
export const GET = route(async (req) => {
  await requireUser(req);
  if (!(await tilesAvailable())) return NextResponse.json({ available: false });
  return NextResponse.json({
    available: true,
    pageUrl: signedMapUrl('page'),
    bounds: MAP_BOUNDS,
  });
});
