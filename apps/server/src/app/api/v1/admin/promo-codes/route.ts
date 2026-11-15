import { NextResponse } from 'next/server';
import { adminPromoCodeSchema } from '@jax/shared';
import { audit } from '@/server/admin/audit';
import { requireAdmin } from '@/server/admin/auth';
import { createPromoCode } from '@/server/admin/promo-codes';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D248: make a promo code (a plan for some days, a use cap, an optional end). Audited. */
export const POST = route(async (req) => {
  const { admin } = await requireAdmin(req);
  const input = await parseBody(req, adminPromoCodeSchema);
  await adminRateLimit(admin.id);
  const c = await createPromoCode(admin.id, input);
  await audit(admin.id, 'PROMO_CODE_CREATE', { type: 'promo', id: c.id }, { code: c.code });
  return NextResponse.json({ id: c.id }, { status: 201 });
});
