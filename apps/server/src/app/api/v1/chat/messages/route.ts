import { NextResponse } from 'next/server';
import { chatSendSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { sendChat } from '@/server/chat/chat';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

export const dynamic = 'force-dynamic';

/**
 * D218: say something in your area's chat. Confirmed accounts only (not guests); 200
 * characters, plain text, no links; forbidden words refused; 1 line per 3 s, 10 a minute and
 * 100 an hour; you must be in the room's cell now.
 */
export const POST = route(async (req) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const input = await parseBody(req, chatSendSchema);
  return NextResponse.json({ line: await sendChat(user, input) }, { status: 201 });
});
