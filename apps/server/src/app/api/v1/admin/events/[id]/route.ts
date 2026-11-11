import { NextResponse } from 'next/server';
import { eventInputSchema } from '@jax/shared';
import { audit } from '@/server/admin/audit';
import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { adminUpdateEvent } from '@/server/events/admin';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D230: change an event (followers of an approved one are told if its dates or place change). */
export const PATCH = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const input = await parseBody(req, eventInputSchema);
  await adminRateLimit(admin.id);
  await adminUpdateEvent(id, input);
  await audit(admin.id, 'EVENT_EDITED', { type: 'event', id }, { title: input.title });
  return NextResponse.json({ ok: true });
});
