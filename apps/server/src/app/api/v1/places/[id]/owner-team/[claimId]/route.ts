import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ownerTeamUpdateSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { removeTeamMember, ownerTeam, setStaffName } from '@/server/directory/owners';
import { ApiError, route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

type Ctx = { params: Promise<{ id: string; claimId: string }> };

async function ids(ctx: Ctx) {
  const { id, claimId } = await ctx.params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(claimId).success) {
    throw new ApiError(404, 'NOT_FOUND', 'Not found');
  }
  return { placeId: id, claimId };
}
const limit = (userId: string) =>
  enforce([
    {
      key: `owner-team:user:${userId}`,
      limitKey: 'rateLimit.ownerTeam.perMinute',
      windowSeconds: 60,
    },
  ]);

/** D157: change a staff name (the primary owner for anyone, a member for themselves). */
export const PATCH = route<Ctx>(async (req, ctx) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const { staffName } = await parseBody(req, ownerTeamUpdateSchema);
  const { placeId, claimId } = await ids(ctx);
  await limit(user.id);
  await setStaffName(user.id, placeId, claimId, staffName);
  return NextResponse.json({ team: await ownerTeam(user.id, placeId) });
});

/** D157: the primary owner removes a team member. */
export const DELETE = route<Ctx>(async (req, ctx) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const { placeId, claimId } = await ids(ctx);
  await limit(user.id);
  await removeTeamMember(user.id, placeId, claimId);
  return NextResponse.json({ team: await ownerTeam(user.id, placeId) });
});
