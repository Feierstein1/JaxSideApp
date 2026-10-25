import { NextResponse } from 'next/server';
import { screeningRuleUpdateSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { audit } from '@/server/admin/audit';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { updateRule } from '@/server/admin/screening-rules';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** P15.9: turn a screening term on or off, or change what it does. */
export const PATCH = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const input = await parseBody(req, screeningRuleUpdateSchema);
  await adminRateLimit(admin.id);
  await updateRule(id, input);
  await audit(admin.id, 'SCREENING_RULE_CHANGED', { type: 'screening-rule', id }, input);
  return NextResponse.json({ ok: true });
});
