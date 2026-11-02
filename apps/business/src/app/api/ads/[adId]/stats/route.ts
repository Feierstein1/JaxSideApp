import { NextResponse } from 'next/server';
import { adStats } from '@/server/ad-stats';
import { requireBusiness } from '@/server/auth';
import { route } from '@/server/http';

type Ctx = { params: Promise<{ adId: string }> };

/** B3.5: an ad's totals for the Owner (no breakdown under 10, never who). */
export const GET = route<Ctx>(async (req, ctx) => {
  const { account } = await requireBusiness(req);
  return NextResponse.json(await adStats(account, (await ctx.params).adId));
});
