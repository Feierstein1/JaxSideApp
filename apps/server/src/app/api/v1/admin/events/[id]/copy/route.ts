import { NextResponse } from 'next/server';
import { adminEventCopySchema } from '@jax/shared';
import { audit } from '@/server/admin/audit';
import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { adminCopyEvent } from '@/server/events/admin';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D230: Duplicate (years 0) or Repeat yearly (years 1). The copy waits for review. Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const { years } = await parseBody(req, adminEventCopySchema);
  await adminRateLimit(admin.id);
  const copyId = await adminCopyEvent(admin.id, id, years);
  await audit(admin.id, 'EVENT_COPIED', { type: 'event', id: copyId }, { from: id, years });
  return NextResponse.json({ id: copyId }, { status: 201 });
});
