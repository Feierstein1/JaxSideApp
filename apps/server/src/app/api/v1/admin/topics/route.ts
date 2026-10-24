import { NextResponse } from 'next/server';
import { adminTopicSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { audit } from '@/server/admin/audit';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { createTopic } from '@/server/topics';
import { parseBody } from '@/server/validate';

/** D125: create a citywide topic (open now, or from a start time). */
export const POST = route(async (req) => {
  const { admin } = await requireAdmin(req);
  const input = await parseBody(req, adminTopicSchema);
  await adminRateLimit(admin.id);
  const id = await createTopic(admin.id, input);
  await audit(admin.id, 'TOPIC_CREATED', { type: 'topic', id }, { title: input.title });
  return NextResponse.json({ id }, { status: 201 });
});
