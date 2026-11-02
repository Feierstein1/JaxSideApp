import { NextResponse } from 'next/server';
import { emptyBodySchema } from '@jax/shared';
import { submitAd } from '@/server/ads';
import { requireBusiness } from '@/server/auth';
import { parseBody, route } from '@/server/http';

type Ctx = { params: Promise<{ adId: string }> };

/** Owner: send a finished draft to JaxSide for approval. */
export const POST = route<Ctx>(async (req, ctx) => {
  const { account } = await requireBusiness(req);
  await parseBody(req, emptyBodySchema);
  return NextResponse.json({ ad: await submitAd(account, (await ctx.params).adId) });
});
