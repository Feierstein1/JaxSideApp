import { NextResponse } from 'next/server';
import { adminPollSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { audit } from '@/server/admin/audit';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { deletePoll, updatePoll } from '@/server/polls';
import { parseBody } from '@/server/validate';

/** D123: change a poll before it opens. */
export const PATCH = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const input = await parseBody(req, adminPollSchema);
  await adminRateLimit(admin.id);
  await updatePoll(id, input);
  await audit(admin.id, 'POLL_EDITED', { type: 'poll', id }, { question: input.question });
  return NextResponse.json({ ok: true });
});

/** D123: delete a poll before it opens. */
export const DELETE = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  await adminRateLimit(admin.id);
  await deletePoll(id);
  await audit(admin.id, 'POLL_DELETED', { type: 'poll', id });
  return NextResponse.json({ ok: true });
});
