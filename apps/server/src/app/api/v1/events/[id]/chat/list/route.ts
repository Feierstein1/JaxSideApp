import { NextResponse } from 'next/server';
import { chatListSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { listEventChat } from '@/server/events/chat';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/**
 * D230: an event chat's lines (usernames only) and the organizer's pinned updates. Only for
 * people who said they're there and are still inside the event area.
 */
export const POST = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const id = await idFrom(ctx);
  const input = await parseBody(req, chatListSchema);
  await enforce([
    {
      key: `event-chat-read:user:${user.id}`,
      limitKey: 'rateLimit.chatRead.perMinute',
      windowSeconds: 60,
    },
  ]);
  return NextResponse.json(await listEventChat(user, id, input));
});
