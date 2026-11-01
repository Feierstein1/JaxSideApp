import { NextResponse } from 'next/server';
import { requireBusiness } from '@/server/auth';
import { route } from '@/server/http';
import { myPlaces } from '@/server/places';

/** B1.4: the places this account runs, with its role at each. */
export const GET = route(async (req) => {
  const { account } = await requireBusiness(req);
  return NextResponse.json({ places: await myPlaces(account.id) });
});
