import { NextResponse } from 'next/server';
import { screeningRuleSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { audit } from '@/server/admin/audit';
import { createRule } from '@/server/admin/screening-rules';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** P15.9: add a screening term. The term itself isn't copied into the audit log. */
export const POST = route(async (req) => {
  const { admin } = await requireAdmin(req);
  const input = await parseBody(req, screeningRuleSchema);
  await adminRateLimit(admin.id);
  const id = await createRule(input);
  await audit(
    admin.id,
    'SCREENING_RULE_ADDED',
    { type: 'screening-rule', id },
    {
      action: input.action,
      category: input.category,
    },
  );
  return NextResponse.json({ id }, { status: 201 });
});
