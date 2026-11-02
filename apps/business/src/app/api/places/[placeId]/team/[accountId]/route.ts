import { NextResponse } from 'next/server';
import { businessTeamUpdateSchema } from '@jax/shared';
import { requireBusiness } from '@/server/auth';
import { parseBody, route } from '@/server/http';
import { updateMember } from '@/server/team';

type Ctx = { params: Promise<{ placeId: string; accountId: string }> };

/** B1.5: change a role or staff name, reset a password, or remove someone (Owner only). */
export const POST = route<Ctx>(async (req, ctx) => {
  const { account } = await requireBusiness(req);
  const input = await parseBody(req, businessTeamUpdateSchema);
  const { placeId, accountId } = await ctx.params;
  return NextResponse.json(await updateMember(account, placeId, accountId, input));
});
