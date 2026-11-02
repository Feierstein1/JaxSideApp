import { NextResponse } from 'next/server';
import { adDeleteSchema } from '@jax/shared';
import { deleteAd } from '@/server/ads';
import { requireBusiness } from '@/server/auth';
import { parseBody, route } from '@/server/http';

type Ctx = { params: Promise<{ adId: string }> };

/** Delete an ad that isn't running (frees a library slot). */
export const POST = route<Ctx>(async (req, ctx) => {
  const { account } = await requireBusiness(req);
  await parseBody(req, adDeleteSchema);
  await deleteAd(account, (await ctx.params).adId);
  return NextResponse.json({ ok: true });
});
