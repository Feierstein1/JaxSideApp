import { NextResponse } from 'next/server';
import { contactResolveSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { audit } from '@/server/admin/audit';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { setContactResolved } from '@/server/contact';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D90: mark a Contact us message resolved (or open again). */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const { resolved } = await parseBody(req, contactResolveSchema);
  await adminRateLimit(admin.id);
  await setContactResolved(id, admin.id, resolved);
  await audit(admin.id, resolved ? 'CONTACT_RESOLVED' : 'CONTACT_REOPENED', {
    type: 'contact',
    id,
  });
  return NextResponse.json({ ok: true });
});
