import { NextResponse } from 'next/server';
import { chatListSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { listChat } from '@/server/chat/chat';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

export const dynamic = 'force-dynamic';

/** D218: the room's lines, oldest first (only the newer ones when `after` is given). */
export const POST = route(async (req) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const input = await parseBody(req, chatListSchema);
  await enforce([
    {
      key: `chat-read:user:${user.id}`,
      limitKey: 'rateLimit.chatRead.perMinute',
      windowSeconds: 60,
    },
  ]);
  return NextResponse.json(await listChat(user, input));
});
