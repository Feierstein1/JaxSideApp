import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { setEventFollow } from '@/server/events/people';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';

const limit = (userId: string) =>
  enforce([
    {
      key: `event-follow:user:${userId}`,
      limitKey: 'rateLimit.eventFollow.perMinute',
      windowSeconds: 60,
    },
  ]);

/** D230: follow an event (Followed events; bell reminders before it starts). Accounts only. */
export const PUT = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const id = await idFrom(ctx);
  await limit(user.id);
  return NextResponse.json(await setEventFollow(user.id, id, true));
});

/** D230: stop following an event. */
export const DELETE = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const id = await idFrom(ctx);
  await limit(user.id);
  return NextResponse.json(await setEventFollow(user.id, id, false));
});
