import { NextResponse } from 'next/server';
import { contactDecisionSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { audit } from '@/server/admin/audit';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { answerContact } from '@/server/contact';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

const ACTION = {
  resolve: 'CONTACT_RESOLVED',
  needs_info: 'CONTACT_NEEDS_INFO',
  reopen: 'CONTACT_REOPENED',
} as const;

/**
 * D90 / D251: answer a Contact us message: "Resolved" or "Need more details" (each emails the
 * sender when they can be emailed), or open it again.
 */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const decision = await parseBody(req, contactDecisionSchema);
  await adminRateLimit(admin.id);
  const { emailed } = await answerContact(id, admin.id, decision);
  await audit(admin.id, ACTION[decision.action], { type: 'contact', id }, { emailed });
  return NextResponse.json({ ok: true, emailed });
});
