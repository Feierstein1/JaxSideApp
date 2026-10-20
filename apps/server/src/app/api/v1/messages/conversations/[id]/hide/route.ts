import { NextResponse } from 'next/server';
import { emptyBodySchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { hideConversation } from '@/server/social/messages';
import { parseBody } from '@/server/validate';

/** D97: "Delete chat for me": hides everything so far; new messages still arrive. */
export const POST = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const id = await idFrom(ctx);
  await parseBody(req, emptyBodySchema);
  await enforce([
    { key: `message:user:${user.id}`, limitKey: 'rateLimit.message.perMinute', windowSeconds: 60 },
  ]);
  await hideConversation(user.id, id);
  return NextResponse.json({ ok: true });
});
