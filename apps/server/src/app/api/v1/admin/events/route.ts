import { NextResponse } from 'next/server';
import { eventInputSchema } from '@jax/shared';
import { audit } from '@/server/admin/audit';
import { requireAdmin } from '@/server/admin/auth';
import { adminRateLimit } from '@/server/admin/users';
import { adminCreateEvent } from '@/server/events/admin';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D230: an admin adds an event (approved at once; the pin must be inside Duval). Audited. */
export const POST = route(async (req) => {
  const { admin } = await requireAdmin(req);
  const input = await parseBody(req, eventInputSchema);
  await adminRateLimit(admin.id);
  const id = await adminCreateEvent(admin.id, input);
  await audit(admin.id, 'EVENT_CREATED', { type: 'event', id }, { title: input.title });
  return NextResponse.json({ id }, { status: 201 });
});
