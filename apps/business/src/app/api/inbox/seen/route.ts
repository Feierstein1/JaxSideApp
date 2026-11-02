import { NextResponse } from 'next/server';
import { businessInboxSeenSchema } from '@jax/shared';
import { requireBusiness } from '@/server/auth';
import { parseBody, route } from '@/server/http';
import { markSeen } from '@/server/inbox';

/** B1.8: mark one place's activity seen, or everything. */
export const POST = route(async (req) => {
  const { account } = await requireBusiness(req);
  const { placeId } = await parseBody(req, businessInboxSeenSchema);
  await markSeen(account, placeId);
  return NextResponse.json({ ok: true });
});
