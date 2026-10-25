import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { setFollow } from '@/server/topics';

const limit = (userId: string) =>
  enforce([
    {
      key: `topic-follow:user:${userId}`,
      limitKey: 'rateLimit.topicFollow.perMinute',
      windowSeconds: 60,
    },
  ]);

/** D133: follow a topic (it appears in your Following list). */
export const PUT = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const id = await idFrom(ctx);
  await limit(user.id);
  return NextResponse.json(await setFollow(user.id, id, true));
});

/** D133: stop following a topic. */
export const DELETE = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const id = await idFrom(ctx);
  await limit(user.id);
  return NextResponse.json(await setFollow(user.id, id, false));
});
