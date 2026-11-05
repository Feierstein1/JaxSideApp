import { NextResponse } from 'next/server';
import { giveawayCreateSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { pageNumber } from '@/server/admin/paging';
import { adminRateLimit } from '@/server/admin/users';
import { createGiveaway, listGiveaways } from '@/server/giveaways';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

export const dynamic = 'force-dynamic';

/** D188: every giveaway and its winners. */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const { rows, ...page } = await listGiveaways(
    pageNumber(new URL(req.url).searchParams.get('page')),
  );
  return NextResponse.json({ giveaways: rows, ...page });
});

/** D188: create a giveaway with its criteria. */
export const POST = route(async (req) => {
  const { admin } = await requireAdmin(req);
  const input = await parseBody(req, giveawayCreateSchema);
  await adminRateLimit(admin.id);
  const g = await createGiveaway(admin.id, input);
  return NextResponse.json({ id: g.id }, { status: 201 });
});
