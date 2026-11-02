import { NextResponse } from 'next/server';
import { businessTeamAddSchema } from '@jax/shared';
import { requireBusiness } from '@/server/auth';
import { parseBody, route } from '@/server/http';
import { addMember, teamFor } from '@/server/team';

type Ctx = { params: Promise<{ placeId: string }> };

/** B1.5: the place's team (Owner only). */
export const GET = route<Ctx>(async (req, ctx) => {
  const { account } = await requireBusiness(req);
  const { placeId } = await ctx.params;
  return NextResponse.json({ team: await teamFor(account, placeId) });
});

/** Add a Manager or Staff member; a new login's temporary password is in the answer, once. */
export const POST = route<Ctx>(async (req, ctx) => {
  const { account } = await requireBusiness(req);
  const input = await parseBody(req, businessTeamAddSchema);
  const { placeId } = await ctx.params;
  return NextResponse.json(await addMember(account, placeId, input), { status: 201 });
});
