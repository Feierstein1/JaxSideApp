import { NextResponse } from 'next/server';
import { emptyBodySchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { unsendMessage } from '@/server/social/messages';
import { parseBody } from '@/server/validate';

/** D98: unsend your own message within 15 minutes (gone for both). */
export const POST = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const id = await idFrom(ctx);
  await parseBody(req, emptyBodySchema);
  await enforce([
    { key: `message:user:${user.id}`, limitKey: 'rateLimit.message.perMinute', windowSeconds: 60 },
  ]);
  await unsendMessage(user.id, id);
  return NextResponse.json({ ok: true });
});
