import { NextResponse } from 'next/server';
import { sendMessageSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { assertLocationEligible } from '@/server/location/eligibility';
import { enforce } from '@/server/rate-limit';
import { messageReadLimit } from '@/server/social/message-limits';
import { listConversations, sendMessage } from '@/server/social/messages';
import { parseBody } from '@/server/validate';

export const dynamic = 'force-dynamic';

/** D98: your chats, newest first. */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  await messageReadLimit(user.id);
  return NextResponse.json({ conversations: await listConversations(user.id) });
});

/**
 * D98: send a message to a friend (text and/or photos). Mutual friends only, inside Duval,
 * screened like posts but never held: refused or sent.
 */
export const POST = route(async (req) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const input = await parseBody(req, sendMessageSchema);
  await enforce([
    {
      key: `message-burst:user:${user.id}`,
      limitKey: 'rateLimit.message.burstPer10s',
      windowSeconds: 10,
    },
    { key: `message:user:${user.id}`, limitKey: 'rateLimit.message.perMinute', windowSeconds: 60 },
    {
      key: `message-day:user:${user.id}`,
      limitKey: 'rateLimit.message.perDay',
      windowSeconds: 86_400,
    },
  ]);
  await assertLocationEligible({ kind: 'user', user }, input.reading, 'message.send');
  return NextResponse.json({ message: await sendMessage(user, input) }, { status: 201 });
});
