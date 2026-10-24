import { NextResponse } from 'next/server';
import { adminPollSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { audit } from '@/server/admin/audit';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { createPoll } from '@/server/polls';
import { parseBody } from '@/server/validate';

/** D123: write a new poll (question, 2–6 choices, open and close times). */
export const POST = route(async (req) => {
  const { admin } = await requireAdmin(req);
  const input = await parseBody(req, adminPollSchema);
  await adminRateLimit(admin.id);
  const id = await createPoll(admin.id, input);
  await audit(admin.id, 'POLL_CREATED', { type: 'poll', id }, { question: input.question });
  return NextResponse.json({ id }, { status: 201 });
});
