import { NextResponse } from 'next/server';
import { emptyBodySchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { audit } from '@/server/admin/audit';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { adminSendBusinessInvite } from '@/server/directory/business-invites';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D172: (re)send a verified primary owner the business-site invite. Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  await parseBody(req, emptyBodySchema);
  await adminRateLimit(admin.id);
  await adminSendBusinessInvite(id);
  await audit(admin.id, 'OWNER_BUSINESS_INVITE', { type: 'owner-claim', id });
  return NextResponse.json({ ok: true });
});
