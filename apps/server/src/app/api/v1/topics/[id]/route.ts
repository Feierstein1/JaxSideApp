import { NextResponse } from 'next/server';
import { requireActor } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { route } from '@/server/http';
import { getTopic } from '@/server/topics';

/** D125: one citywide topic. */
export const GET = route<IdCtx>(async (req, ctx) => {
  await requireActor(req);
  return NextResponse.json({ topic: await getTopic(await idFrom(ctx)) });
});
