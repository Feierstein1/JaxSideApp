import { NextResponse } from 'next/server';
import { chatStatusSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { chatStatus } from '@/server/chat/chat';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

export const dynamic = 'force-dynamic';

/** D218: where you are and whether area chat is open there (confirmed accounts; not guests). */
export const POST = route(async (req) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const input = await parseBody(req, chatStatusSchema);
  await enforce([
    {
      key: `chat-read:user:${user.id}`,
      limitKey: 'rateLimit.chatRead.perMinute',
      windowSeconds: 60,
    },
  ]);
  return NextResponse.json(await chatStatus(user, input.reading));
});
