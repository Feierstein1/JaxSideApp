import { NextResponse } from 'next/server';
import { requireBusiness } from '@/server/auth';
import { route } from '@/server/http';
import { placeInsights } from '@/server/insights';

type Ctx = { params: Promise<{ placeId: string }> };

/** B2.1: counts for the place (Owner, plan with insights). `?period=7d|30d`. */
export const GET = route<Ctx>(async (req, ctx) => {
  const { account } = await requireBusiness(req);
  const { placeId } = await ctx.params;
  const period = new URL(req.url).searchParams.get('period') === '30d' ? '30d' : '7d';
  return NextResponse.json(await placeInsights(account, placeId, period));
});
