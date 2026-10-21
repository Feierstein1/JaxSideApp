import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { meView } from '@/server/profiles';

export const dynamic = 'force-dynamic';

/** The caller's own account. Private view (includes their email), still via a serializer. */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  return NextResponse.json({ user: await meView(user) });
});
