import { NextResponse } from 'next/server';
import { maintenanceSchema } from '@jax/shared';
import { audit } from '@/server/admin/audit';
import { requireAdmin } from '@/server/admin/auth';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { setMaintenance } from '@/server/maintenance';
import { parseBody } from '@/server/validate';

/**
 * D246: the emergency switch. On: the app shows "JaxSide is currently having maintenance
 * done" and everyone is signed out; off: people sign in again. Audited.
 */
export const POST = route(async (req) => {
  const { admin } = await requireAdmin(req);
  const input = await parseBody(req, maintenanceSchema);
  await adminRateLimit(admin.id);
  const signedOut = await setMaintenance({ enabled: input.enabled, message: input.message });
  await audit(
    admin.id,
    input.enabled ? 'MAINTENANCE_ON' : 'MAINTENANCE_OFF',
    { type: 'setting', id: null },
    { reason: input.reason, signedOut },
  );
  return NextResponse.json({ enabled: input.enabled, signedOut });
});
