import { NextResponse } from 'next/server';
import { userActionSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit, userAction } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** P5.6 / P5.14: strike, suspend, ban, lift, note, or cancel a strike. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const userId = await uuidParam(ctx);
  const input = await parseBody(req, userActionSchema);
  await adminRateLimit(admin.id);
  return NextResponse.json({ result: await userAction(admin.id, userId, input) });
});
