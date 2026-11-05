import { NextResponse } from 'next/server';
import { adminAdDecisionSchema } from '@jax/shared';
import { decideAd } from '@/server/admin/ad-review';
import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** B3.3 / D206: approve an ad or turn it down (with a reason). Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const input = await parseBody(req, adminAdDecisionSchema);
  await adminRateLimit(admin.id);
  await decideAd(admin.id, id, input);
  return NextResponse.json({ ok: true });
});
