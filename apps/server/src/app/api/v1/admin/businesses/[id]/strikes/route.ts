import { NextResponse } from 'next/server';
import { adminBusinessStrikeSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { businessStrikeAction } from '@/server/admin/businesses';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D191: a strike on a business login (or "Notify" from a report), or cancelling one. Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const input = await parseBody(req, adminBusinessStrikeSchema);
  await adminRateLimit(admin.id);
  return NextResponse.json({ result: await businessStrikeAction(admin.id, id, input) });
});
