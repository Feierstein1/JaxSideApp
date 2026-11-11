import { NextResponse } from 'next/server';
import { adminOrganizerDecisionSchema } from '@jax/shared';
import { audit } from '@/server/admin/audit';
import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { adminDecideOrganizer } from '@/server/events/organizers';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D230: approve, reject or revoke an event organizer (the business account's ID). Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const input = await parseBody(req, adminOrganizerDecisionSchema);
  await adminRateLimit(admin.id);
  await adminDecideOrganizer(admin.id, id, input);
  await audit(
    admin.id,
    `ORGANIZER_${input.action.toUpperCase()}`,
    { type: 'business', id },
    'note' in input ? { reason: input.note } : undefined,
  );
  return NextResponse.json({ ok: true });
});
