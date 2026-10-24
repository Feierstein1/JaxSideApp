import { NextResponse } from 'next/server';
import { adminTopicDecisionSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { audit } from '@/server/admin/audit';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { decideTopic } from '@/server/topics';
import { parseBody } from '@/server/validate';

/** D125: approve or reject a suggestion; close or reopen a topic. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const input = await parseBody(req, adminTopicDecisionSchema);
  await adminRateLimit(admin.id);
  await decideTopic(id, input);
  await audit(
    admin.id,
    `TOPIC_${input.action.toUpperCase()}`,
    { type: 'topic', id },
    input.action === 'reject' ? { reason: input.reason } : undefined,
  );
  return NextResponse.json({ ok: true });
});
