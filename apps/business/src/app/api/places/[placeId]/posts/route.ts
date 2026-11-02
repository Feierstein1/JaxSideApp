import { NextResponse } from 'next/server';
import { businessPostCreateSchema } from '@jax/shared';
import { requireBusiness } from '@/server/auth';
import { createPost, listPosts } from '@/server/discussion';
import { parseBody, route } from '@/server/http';

type Ctx = { params: Promise<{ placeId: string }> };

/** B1.6: the place's discussion, newest first (`?before=` for the next page). */
export const GET = route<Ctx>(async (req, ctx) => {
  const { account } = await requireBusiness(req);
  const { placeId } = await ctx.params;
  const before = new URL(req.url).searchParams.get('before') ?? undefined;
  const { posts, nextBefore } = await listPosts(account, placeId, before);
  return NextResponse.json({ posts, nextBefore });
});

/** A post as "The Owner", from anywhere. */
export const POST = route<Ctx>(async (req, ctx) => {
  const { account } = await requireBusiness(req);
  const input = await parseBody(req, businessPostCreateSchema);
  const { placeId } = await ctx.params;
  return NextResponse.json(await createPost(account, placeId, input), { status: 201 });
});
