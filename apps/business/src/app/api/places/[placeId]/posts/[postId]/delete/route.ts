import { NextResponse } from 'next/server';
import { businessDeleteSchema } from '@jax/shared';
import { requireBusiness } from '@/server/auth';
import { removeOwn } from '@/server/discussion';
import { parseBody, route } from '@/server/http';

type Ctx = { params: Promise<{ placeId: string; postId: string }> };

/** B1.6: remove a post the business wrote. */
export const POST = route<Ctx>(async (req, ctx) => {
  const { account } = await requireBusiness(req);
  await parseBody(req, businessDeleteSchema);
  const { placeId, postId } = await ctx.params;
  await removeOwn(account, placeId, { postId });
  return NextResponse.json({ ok: true });
});
