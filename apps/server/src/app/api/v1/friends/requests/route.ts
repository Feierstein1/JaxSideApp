import { NextResponse } from 'next/server';
import { friendRequestSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { listFriendRequests, sendFriendRequest } from '@/server/social/friends';
import { socialLimit } from '@/server/social/limits';
import { parseBody } from '@/server/validate';

export const dynamic = 'force-dynamic';

/** D76: requests waiting on you (incoming) and on others (outgoing). */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  await socialLimit(user.id);
  return NextResponse.json(await listFriendRequests(user.id));
});

/** D76: send a friend request (accepts theirs if they already asked you). */
export const POST = route(async (req) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const { username } = await parseBody(req, friendRequestSchema);
  await enforce([
    {
      key: `friend-request:user:${user.id}`,
      limitKey: 'rateLimit.friendRequest.perHour',
      windowSeconds: 3600,
    },
    {
      key: `friend-request-day:user:${user.id}`,
      limitKey: 'rateLimit.friendRequest.perDay',
      windowSeconds: 86_400,
    },
  ]);
  return NextResponse.json(await sendFriendRequest(user.id, username));
});
