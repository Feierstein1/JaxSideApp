import { NextResponse } from 'next/server';
import { businessReplySchema } from '@jax/shared';
import { requireBusiness } from '@/server/auth';
import { createReply } from '@/server/discussion';
import { parseBody, route } from '@/server/http';

type Ctx = { params: Promise<{ placeId: string; postId: string }> };

/** B1.6: a reply as "The Owner", from anywhere. */
export const POST = route<Ctx>(async (req, ctx) => {
  const { account } = await requireBusiness(req);
  const input = await parseBody(req, businessReplySchema);
  const { placeId, postId } = await ctx.params;
  return NextResponse.json(await createReply(account, placeId, postId, input), { status: 201 });
});
