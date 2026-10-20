import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/admin/auth';
import { audit } from '@/server/admin/audit';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { adminKeepPlace, adminRemovePlace } from '@/server/directory/place-changes';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

const schema = z.strictObject({ action: z.enum(['keep', 'remove']) });

/** D94: overrule the community: keep (or restore) the place, or take it down now. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const { action } = await parseBody(req, schema);
  await adminRateLimit(admin.id);
  if (action === 'keep') await adminKeepPlace(admin.id, id);
  else await adminRemovePlace(admin.id, id);
  await audit(admin.id, action === 'keep' ? 'PLACE_KEPT' : 'PLACE_REMOVED', {
    type: 'place-removal',
    id,
  });
  return NextResponse.json({ ok: true });
});
