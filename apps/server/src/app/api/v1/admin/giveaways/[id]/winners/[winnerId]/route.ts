import { NextResponse } from 'next/server';
import { z } from 'zod';
import { giveawayWinnerActionSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { adminRateLimit } from '@/server/admin/users';
import { winnerAction } from '@/server/giveaways';
import { ApiError, route } from '@/server/http';
import { parseBody } from '@/server/validate';

type Params = { params: Promise<{ id: string; winnerId: string }> };
const ids = z.object({ id: z.uuid(), winnerId: z.uuid() });

/** D188: reveal an accepted winner's email (reason audited), mark the prize sent, disqualify. */
export const POST = route<Params>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const parsed = ids.safeParse(await ctx.params);
  if (!parsed.success) throw new ApiError(404, 'NOT_FOUND', 'Not found');
  const input = await parseBody(req, giveawayWinnerActionSchema);
  await adminRateLimit(admin.id);
  const result = await winnerAction(admin.id, parsed.data.id, parsed.data.winnerId, input);
  return NextResponse.json(
    { result },
    // The revealed email must never sit in a cache.
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
