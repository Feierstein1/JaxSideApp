import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { db } from '@/server/db';
import { route } from '@/server/http';
import { toMe } from '@/server/serializers';

export const dynamic = 'force-dynamic';

/** The caller's own account. Private view (includes their email), still via a serializer. */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  return NextResponse.json({ user: toMe({ ...user, profile }) });
});
