import { NextResponse } from 'next/server';
import { requireBusiness } from '@/server/auth';
import { getThread } from '@/server/discussion';
import { route } from '@/server/http';

type Ctx = { params: Promise<{ placeId: string; postId: string }> };

/** B1.6: one post of the place with its comments. */
export const GET = route<Ctx>(async (req, ctx) => {
  const { account } = await requireBusiness(req);
  const { placeId, postId } = await ctx.params;
  const { post, comments, commentsLocked } = await getThread(account, placeId, postId);
  return NextResponse.json({ post, comments, commentsLocked });
});
