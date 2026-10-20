import { NextResponse } from 'next/server';
import { ownerDecisionSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { audit } from '@/server/admin/audit';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { decideOwnerClaim } from '@/server/directory/owners';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D103: approve or reject an owner claim, or take a verified owner's tag away. Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const { action, note } = await parseBody(req, ownerDecisionSchema);
  await adminRateLimit(admin.id);
  await decideOwnerClaim(admin.id, id, action, note);
  await audit(
    admin.id,
    `OWNER_${action.toUpperCase()}`,
    { type: 'owner-claim', id },
    {
      ...(note ? { note } : {}),
    },
  );
  return NextResponse.json({ ok: true });
});
