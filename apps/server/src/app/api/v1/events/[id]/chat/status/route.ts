import { NextResponse } from 'next/server';
import { chatStatusSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { eventChatStatus } from '@/server/events/chat';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/**
 * D230: where you stand with an event's chat: closed, open but you're away, "are you here?",
 * or joined. Accounts only (the event page asks while it's open).
 */
export const POST = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const id = await idFrom(ctx);
  const { reading } = await parseBody(req, chatStatusSchema);
  await enforce([
    {
      key: `event-chat-read:user:${user.id}`,
      limitKey: 'rateLimit.chatRead.perMinute',
      windowSeconds: 60,
    },
  ]);
  return NextResponse.json(await eventChatStatus(user, id, reading));
});
