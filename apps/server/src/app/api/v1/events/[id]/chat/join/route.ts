import { NextResponse } from 'next/server';
import { chatStatusSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { joinEventChat } from '@/server/events/chat';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/**
 * D230: "Yes, I'm here". Only while the chat is open and you're inside the event area
 * (checked on the server). Confirmed accounts.
 */
export const POST = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const id = await idFrom(ctx);
  const { reading } = await parseBody(req, chatStatusSchema);
  await enforce([
    {
      key: `event-chat-read:user:${user.id}`,
      limitKey: 'rateLimit.chatRead.perMinute',
      windowSeconds: 60,
    },
  ]);
  return NextResponse.json(await joinEventChat(user, id, reading));
});
