import { NextResponse } from 'next/server';
import { appealDecisionSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { audit } from '@/server/admin/audit';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { decideAppeal } from '@/server/moderation/appeals';
import { parseBody } from '@/server/validate';

/** P5.7: accept (cancels the strike) or reject an appeal, with a note the person sees. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const appealId = await uuidParam(ctx);
  const input = await parseBody(req, appealDecisionSchema);
  await adminRateLimit(admin.id);
  await decideAppeal({ adminId: admin.id, appealId, ...input });
  await audit(admin.id, input.accept ? 'APPEAL_ACCEPTED' : 'APPEAL_REJECTED', {
    type: 'appeal',
    id: appealId,
  });
  return NextResponse.json({ ok: true });
});
