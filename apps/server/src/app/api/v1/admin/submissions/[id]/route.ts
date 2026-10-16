import { NextResponse } from 'next/server';
import { submissionDecisionSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { decideSubmission } from '@/server/directory/submissions';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** P5.12 / P5.13: approve (optionally corrected), reject with a reason, or merge. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const input = await parseBody(req, submissionDecisionSchema);
  await adminRateLimit(admin.id);
  return NextResponse.json(await decideSubmission(admin.id, id, input));
});
