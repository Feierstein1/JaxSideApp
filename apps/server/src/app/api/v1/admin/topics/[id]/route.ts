import { NextResponse } from 'next/server';
import { adminTopicSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { audit } from '@/server/admin/audit';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { updateTopic } from '@/server/topics';
import { parseBody } from '@/server/validate';

/** D125: change a topic's wording, pin, start or end. */
export const PATCH = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const input = await parseBody(req, adminTopicSchema);
  await adminRateLimit(admin.id);
  await updateTopic(id, input);
  await audit(admin.id, 'TOPIC_EDITED', { type: 'topic', id }, { title: input.title });
  return NextResponse.json({ ok: true });
});
