import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/admin/auth';
import { audit } from '@/server/admin/audit';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { contactReplyEmail } from '@/server/contact';
import { route } from '@/server/http';

export const dynamic = 'force-dynamic';

/**
 * D90: the sender's account email, only if they allowed replies on this message. Every
 * viewing is written to the audit log.
 */
export const GET = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  await adminRateLimit(admin.id);
  const email = await contactReplyEmail(id);
  if (email) await audit(admin.id, 'CONTACT_EMAIL_VIEWED', { type: 'contact', id });
  return NextResponse.json({ email }, { headers: { 'Cache-Control': 'no-store' } });
});
