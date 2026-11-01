import { NextResponse } from 'next/server';
import { businessInviteAcceptSchema } from '@jax/shared';
import { requireBusiness } from '@/server/auth';
import { parseBody, route } from '@/server/http';
import { acceptInviteExisting } from '@/server/invites';

/** B1.3: add the invited place to the signed-in owner's business account. */
export const POST = route(async (req) => {
  const { account } = await requireBusiness(req);
  const { token } = await parseBody(req, businessInviteAcceptSchema);
  return NextResponse.json({ places: await acceptInviteExisting(account, token) });
});
