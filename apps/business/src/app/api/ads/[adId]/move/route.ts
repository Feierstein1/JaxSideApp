import { NextResponse } from 'next/server';
import { adMoveSchema } from '@jax/shared';
import { moveAd } from '@/server/ads';
import { requireBusiness } from '@/server/auth';
import { parseBody, route } from '@/server/http';

type Ctx = { params: Promise<{ adId: string }> };

/** Owner: withdraw from review, pause, resume or end an ad. */
export const POST = route<Ctx>(async (req, ctx) => {
  const { account } = await requireBusiness(req);
  const { move } = await parseBody(req, adMoveSchema);
  return NextResponse.json({ ad: await moveAd(account, (await ctx.params).adId, move) });
});
