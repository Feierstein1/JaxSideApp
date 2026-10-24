import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/admin/auth';
import { audit } from '@/server/admin/audit';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { endPollNow } from '@/server/polls';

/** D123: end an open poll now; it's counted right away. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  await adminRateLimit(admin.id);
  await endPollNow(id);
  await audit(admin.id, 'POLL_ENDED', { type: 'poll', id });
  return NextResponse.json({ ok: true });
});
