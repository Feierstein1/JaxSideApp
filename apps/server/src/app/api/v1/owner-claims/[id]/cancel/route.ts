import { NextResponse } from 'next/server';
import { emptyBodySchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { cancelOwnerClaim } from '@/server/directory/owners';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/** D103: withdraw your own claim (to start over another way). */
export const POST = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const id = await idFrom(ctx);
  await parseBody(req, emptyBodySchema);
  await enforce([
    {
      key: `owner-code:user:${user.id}`,
      limitKey: 'rateLimit.ownerCode.perMinute',
      windowSeconds: 60,
    },
  ]);
  await cancelOwnerClaim(user.id, id);
  return NextResponse.json({ ok: true });
});
