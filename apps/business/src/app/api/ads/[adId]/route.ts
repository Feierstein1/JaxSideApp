import { NextResponse } from 'next/server';
import { adDraftSchema } from '@jax/shared';
import { getAd, updateAd } from '@/server/ads';
import { requireBusiness } from '@/server/auth';
import { parseBody, route } from '@/server/http';

type Ctx = { params: Promise<{ adId: string }> };

export const GET = route<Ctx>(async (req, ctx) => {
  const { account } = await requireBusiness(req);
  return NextResponse.json({ ad: await getAd(account, (await ctx.params).adId) });
});

/** Save changes (an approved ad goes back for approval). */
export const POST = route<Ctx>(async (req, ctx) => {
  const { account } = await requireBusiness(req);
  const input = await parseBody(req, adDraftSchema);
  return NextResponse.json({ ad: await updateAd(account, (await ctx.params).adId, input) });
});
