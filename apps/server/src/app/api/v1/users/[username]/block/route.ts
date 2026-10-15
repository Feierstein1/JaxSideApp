import { NextResponse } from 'next/server';
import { emptyBodySchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { setBlock, usernameFrom, type UsernameCtx } from '@/server/profiles';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/** P5.2 (early): block / unblock. Content is hidden both ways (P3.9). */
async function handle(req: Request, ctx: UsernameCtx, blocked: boolean) {
  const { user } = await requireUser(req);
  const username = await usernameFrom(ctx);
  await parseBody(req, emptyBodySchema);
  await enforce([
    { key: `block:user:${user.id}`, limitKey: 'rateLimit.block.perMinute', windowSeconds: 60 },
  ]);
  await setBlock(user.id, username, blocked);
  return NextResponse.json({ blocked });
}

export const PUT = route<UsernameCtx>((req, ctx) => handle(req, ctx, true));
export const DELETE = route<UsernameCtx>((req, ctx) => handle(req, ctx, false));
