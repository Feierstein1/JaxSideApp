import { NextResponse } from 'next/server';
import { caseDecisionSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { caseParam, type CaseParams } from '@/server/admin/params';
import { decideCase, getCase } from '@/server/admin/queue';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

export const dynamic = 'force-dynamic';

/** P5.14: one case with its reports, context and the author's history. */
export const GET = route<CaseParams>(async (req, ctx) => {
  await requireAdmin(req);
  return NextResponse.json(await getCase(await caseParam(ctx)));
});

/** P5.14: decide the case (remove, approve, dismiss, escalate), optionally with a strike. */
export const POST = route<CaseParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const ref = await caseParam(ctx);
  const input = await parseBody(req, caseDecisionSchema);
  await adminRateLimit(admin.id);
  return NextResponse.json(await decideCase({ adminId: admin.id, ref, ...input }));
});
