import { NextResponse } from 'next/server';
import { reviewModeSchema } from '@jax/shared';
import { audit } from '@/server/admin/audit';
import { requireAdmin } from '@/server/admin/auth';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { setReviewMode } from '@/server/review';
import { parseBody } from '@/server/validate';

/** D268: turn App Store / Google Play review mode on or off for everyone. Audited. */
export const POST = route(async (req) => {
  const { admin } = await requireAdmin(req);
  const input = await parseBody(req, reviewModeSchema);
  await adminRateLimit(admin.id);
  await setReviewMode(input.on);
  await audit(
    admin.id,
    input.on ? 'REVIEW_MODE_ON' : 'REVIEW_MODE_OFF',
    { type: 'setting', id: null },
    { reason: input.reason },
  );
  return NextResponse.json({ on: input.on });
});
