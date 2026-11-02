import { NextResponse } from 'next/server';
import { requireBusiness } from '@/server/auth';
import { route } from '@/server/http';
import { getInbox } from '@/server/inbox';

/** B1.8: what's new at each place since last seen, and messages from JaxSide. */
export const GET = route(async (req) => {
  const { account } = await requireBusiness(req);
  return NextResponse.json(await getInbox(account));
});
