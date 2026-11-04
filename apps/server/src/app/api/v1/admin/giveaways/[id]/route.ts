import { NextResponse } from 'next/server';
import { giveawayActionSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { getGiveaway, giveawayAction } from '@/server/giveaways';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

export const dynamic = 'force-dynamic';

/** D188: one giveaway: criteria, winners, and the eligible accounts (`?page=`, 50 a page). */
export const GET = route<IdParams>(async (req, ctx) => {
  await requireAdmin(req);
  const page = Number(new URL(req.url).searchParams.get('page'));
  const g = await getGiveaway(await uuidParam(ctx), Number.isInteger(page) && page > 0 ? page : 1);
  return NextResponse.json(g);
});

/** D188: draw winners at random, pick one by hand, or cancel the giveaway. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const input = await parseBody(req, giveawayActionSchema);
  await adminRateLimit(admin.id);
  return NextResponse.json({ result: await giveawayAction(admin.id, id, input) });
});
