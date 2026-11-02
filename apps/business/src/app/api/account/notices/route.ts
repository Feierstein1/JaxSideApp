import { NextResponse } from 'next/server';
import { businessEmailNoticesSchema } from '@jax/shared';
import { requireBusiness } from '@/server/auth';
import { parseBody, route } from '@/server/http';
import { setEmailNotices } from '@/server/inbox';

/** B1.8: the daily summary email on or off. */
export const POST = route(async (req) => {
  const { account } = await requireBusiness(req);
  const { on } = await parseBody(req, businessEmailNoticesSchema);
  await setEmailNotices(account, on);
  return NextResponse.json({ ok: true });
});
