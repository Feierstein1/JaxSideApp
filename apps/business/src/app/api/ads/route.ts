import { NextResponse } from 'next/server';
import { adDraftSchema } from '@jax/shared';
import { createAd, listAds } from '@/server/ads';
import { requireBusiness } from '@/server/auth';
import { parseBody, route } from '@/server/http';

/** B3.2: the business's ad library (the places this login works on ads for). */
export const GET = route(async (req) => {
  const { account } = await requireBusiness(req);
  return NextResponse.json(await listAds(account));
});

/** Save a new draft (Owner or Manager; at most 20 ads per business). */
export const POST = route(async (req) => {
  const { account } = await requireBusiness(req);
  const input = await parseBody(req, adDraftSchema);
  return NextResponse.json({ ad: await createAd(account, input) }, { status: 201 });
});
