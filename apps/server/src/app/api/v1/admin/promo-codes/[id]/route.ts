import { NextResponse } from 'next/server';
import { adminPromoActiveSchema } from '@jax/shared';
import { audit } from '@/server/admin/audit';
import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { setPromoActive } from '@/server/admin/promo-codes';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D248: turn a promo code off (no new uses) or back on. Audited. */
export const PATCH = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const { active } = await parseBody(req, adminPromoActiveSchema);
  await adminRateLimit(admin.id);
  await setPromoActive(id, active);
  await audit(admin.id, active ? 'PROMO_CODE_ON' : 'PROMO_CODE_OFF', { type: 'promo', id });
  return NextResponse.json({ ok: true });
});
