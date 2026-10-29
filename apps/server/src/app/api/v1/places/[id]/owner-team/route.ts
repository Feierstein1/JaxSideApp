import { NextResponse } from 'next/server';
import { ownerTeamAddSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { addTeamMember, ownerTeam } from '@/server/directory/owners';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

export const dynamic = 'force-dynamic';

const limit = (userId: string) =>
  enforce([
    {
      key: `owner-team:user:${userId}`,
      limitKey: 'rateLimit.ownerTeam.perMinute',
      windowSeconds: 60,
    },
  ]);

/** D157: the place's owner team (only its members can see it). */
export const GET = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const placeId = await idFrom(ctx);
  return NextResponse.json({ team: await ownerTeam(user.id, placeId) });
});

/** D157: the primary owner adds a team member by username. */
export const POST = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const placeId = await idFrom(ctx);
  const input = await parseBody(req, ownerTeamAddSchema);
  await limit(user.id);
  await addTeamMember(user.id, placeId, input);
  return NextResponse.json({ team: await ownerTeam(user.id, placeId) }, { status: 201 });
});
