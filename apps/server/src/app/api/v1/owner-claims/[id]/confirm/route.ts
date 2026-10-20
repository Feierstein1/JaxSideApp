import { NextResponse } from 'next/server';
import { ownerCodeSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { confirmOwnerCode } from '@/server/directory/owners';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/** D103: enter the code from the business email or the admin's phone call (your claim only). */
export const POST = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const id = await idFrom(ctx);
  const { code } = await parseBody(req, ownerCodeSchema);
  await enforce([
    {
      key: `owner-code:user:${user.id}`,
      limitKey: 'rateLimit.ownerCode.perMinute',
      windowSeconds: 60,
    },
  ]);
  return NextResponse.json({ claim: await confirmOwnerCode(user.id, id, code) });
});
