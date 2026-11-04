import { NextResponse } from 'next/server';
import { giveawayResponseSchema } from '@jax/shared';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { requireUser } from '@/server/auth/require-actor';
import { respondToWin } from '@/server/giveaways';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D188: accept or decline a giveaway prize (yours only, before the deadline). */
export const POST = route<IdParams>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const id = await uuidParam(ctx);
  const { accept } = await parseBody(req, giveawayResponseSchema);
  await respondToWin(user, id, accept);
  return NextResponse.json({ ok: true });
});
