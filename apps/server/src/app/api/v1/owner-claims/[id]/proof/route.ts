import { NextResponse } from 'next/server';
import { ownerProofSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { submitOwnerProof } from '@/server/directory/owners';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/** D103: where you posted the code (website or official social page); an admin checks it. */
export const POST = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const id = await idFrom(ctx);
  const { proofUrl } = await parseBody(req, ownerProofSchema);
  await enforce([
    {
      key: `owner-code:user:${user.id}`,
      limitKey: 'rateLimit.ownerCode.perMinute',
      windowSeconds: 60,
    },
  ]);
  return NextResponse.json({ claim: await submitOwnerProof(user.id, id, proofUrl) });
});
