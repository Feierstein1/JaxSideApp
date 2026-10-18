import { NextResponse } from 'next/server';
import { friendPrivacySchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { db } from '@/server/db';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/** D76: "Hide my recent posts from friends" (the friends feed leaves you out). */
export const PATCH = route(async (req) => {
  const { user } = await requireUser(req);
  const { hidePostsFromFriends } = await parseBody(req, friendPrivacySchema);
  await enforce([
    {
      key: `preferences:user:${user.id}`,
      limitKey: 'rateLimit.preferences.perMinute',
      windowSeconds: 60,
    },
  ]);
  await db.user.update({ where: { id: user.id }, data: { hidePostsFromFriends } });
  return NextResponse.json({ hidePostsFromFriends });
});
