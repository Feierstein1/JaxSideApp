import { NextResponse } from 'next/server';
import { topicApprovalSchema } from '@jax/shared';
import { audit } from '@/server/admin/audit';
import { requireAdmin } from '@/server/admin/auth';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { setTopicApprovalRequired } from '@/server/topics';
import { parseBody } from '@/server/validate';

/** D222: make topics need admin approval, or let them appear at once. Audited. */
export const POST = route(async (req) => {
  const { admin } = await requireAdmin(req);
  const input = await parseBody(req, topicApprovalSchema);
  await adminRateLimit(admin.id);
  await setTopicApprovalRequired(input.required);
  await audit(
    admin.id,
    input.required ? 'TOPIC_APPROVAL_ON' : 'TOPIC_APPROVAL_OFF',
    { type: 'setting', id: null },
    { reason: input.reason },
  );
  return NextResponse.json({ required: input.required });
});
