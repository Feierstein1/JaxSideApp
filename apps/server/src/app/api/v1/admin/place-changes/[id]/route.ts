import { NextResponse } from 'next/server';
import { adminChangeDecisionSchema } from '@jax/shared';
import { audit } from '@/server/admin/audit';
import { requireAdmin } from '@/server/admin/auth';
import { decidePlaceChange } from '@/server/admin/change-requests';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D242: approve or turn down a place change (a note is needed to turn it down). Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const input = await parseBody(req, adminChangeDecisionSchema);
  await adminRateLimit(admin.id);
  await decidePlaceChange(admin.id, id, input);
  await audit(
    admin.id,
    `PLACE_CHANGE_${input.decision.toUpperCase()}`,
    { type: 'business', id },
    input.note ? { reason: input.note } : undefined,
  );
  return NextResponse.json({ ok: true });
});
