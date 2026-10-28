import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/admin/auth';
import { audit } from '@/server/admin/audit';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { featurePoll } from '@/server/polls';
import { parseBody } from '@/server/validate';

const schema = z.strictObject({ featured: z.boolean() });

/** D150: make a poll the Poll of the week (Home shows it first), or stop. Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const { featured } = await parseBody(req, schema);
  await adminRateLimit(admin.id);
  await featurePoll(id, featured);
  await audit(admin.id, featured ? 'POLL_FEATURED' : 'POLL_UNFEATURED', { type: 'poll', id });
  return NextResponse.json({ ok: true });
});
