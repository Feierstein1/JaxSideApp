import { NextResponse } from 'next/server';
import { ownerClaimSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { myOwnerClaims, startOwnerClaim } from '@/server/directory/owners';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

export const dynamic = 'force-dynamic';

/** D103: your owner claims for this place, and which ways to verify it supports. */
export const GET = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const placeId = await idFrom(ctx);
  return NextResponse.json(await myOwnerClaims(user.id, placeId));
});

/**
 * D103: "I own this place". EMAIL sends a code to an address at the business's own web
 * domain; WEBSITE gives a code to post publicly; PHONE has an admin call the business.
 */
export const POST = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const placeId = await idFrom(ctx);
  const input = await parseBody(req, ownerClaimSchema);
  await enforce([
    {
      key: `owner-claim:user:${user.id}`,
      limitKey: 'rateLimit.ownerClaim.perDay',
      windowSeconds: 86_400,
    },
  ]);
  return NextResponse.json({ claim: await startOwnerClaim(user, placeId, input) }, { status: 201 });
});
