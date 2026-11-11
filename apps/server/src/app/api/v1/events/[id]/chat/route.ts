import { NextResponse } from 'next/server';
import { chatSendSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { sendEventChat } from '@/server/events/chat';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/**
 * D230: say something in an event's chat. Area chat's limits, screening and mutes (checked
 * inside), the location on every line, and no emergency posts (call 911 instead).
 */
export const POST = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const id = await idFrom(ctx);
  const input = await parseBody(req, chatSendSchema);
  return NextResponse.json({ line: await sendEventChat(user, id, input) }, { status: 201 });
});
