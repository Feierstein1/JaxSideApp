import { NextResponse } from 'next/server';
import { businessInviteAcceptNewSchema } from '@jax/shared';
import { accountView, assertSameOrigin, sessionCookies } from '@/server/auth';
import { parseBody, route } from '@/server/http';
import { acceptInviteNew } from '@/server/invites';

/** B1.3: create a business account from an invite (rate limited per IP inside). */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const input = await parseBody(req, businessInviteAcceptNewSchema);
  const result = await acceptInviteNew(input, req);
  const res = NextResponse.json(
    { account: accountView(result.account), places: result.places },
    { status: 201 },
  );
  for (const cookie of sessionCookies(result)) res.headers.append('Set-Cookie', cookie);
  return res;
});
