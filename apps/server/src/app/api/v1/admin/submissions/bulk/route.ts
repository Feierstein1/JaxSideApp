import { NextResponse } from 'next/server';
import { submissionBulkSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { adminRateLimit } from '@/server/admin/users';
import { decideMany } from '@/server/directory/submissions';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** P5.12: approve or reject a selected batch (the page lists them for confirmation first). */
export const POST = route(async (req) => {
  const { admin } = await requireAdmin(req);
  const input = await parseBody(req, submissionBulkSchema);
  await adminRateLimit(admin.id);
  const { ids, ...decision } = input;
  return NextResponse.json({ results: await decideMany(admin.id, ids, decision) });
});
