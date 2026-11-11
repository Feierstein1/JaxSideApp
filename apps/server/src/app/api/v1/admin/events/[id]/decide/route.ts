import { NextResponse } from 'next/server';
import { adminEventDecisionSchema } from '@jax/shared';
import { audit } from '@/server/admin/audit';
import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { adminDecideEvent } from '@/server/events/admin';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D230: approve, deny, cancel, remove or restore an event. Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const input = await parseBody(req, adminEventDecisionSchema);
  await adminRateLimit(admin.id);
  await adminDecideEvent(admin.id, id, input);
  await audit(
    admin.id,
    `EVENT_${input.action.toUpperCase()}`,
    { type: 'event', id },
    'reason' in input ? { reason: input.reason } : undefined,
  );
  return NextResponse.json({ ok: true });
});
