import { db } from './db';

/** D246: what the app shows while the switch is on. */
export const MAINTENANCE_TEXT = 'JaxSide is currently having maintenance done.';

export interface MaintenanceState {
  on: boolean;
  /** The admin's optional extra line. */
  message: string | null;
  since: Date | null;
}

const OFF: MaintenanceState = { on: false, message: null, since: null };
/** Every request asks; a few seconds old is fine, and switching drops the cache at once. */
const TTL_MS = 3_000;
let cached: { at: number; state: MaintenanceState } | null = null;

export function invalidateMaintenanceCache() {
  cached = null;
}

/** The switch as stored now (the admin page uses this; requests use the cached read). */
export async function readMaintenance(): Promise<MaintenanceState> {
  const row = await db.maintenanceMode.findUnique({ where: { id: 1 } });
  if (!row?.enabled) return OFF;
  return { on: true, message: row.message, since: row.enabledAt };
}

/**
 * Is the app switched off? If the database can't be read the answer is "no": a database
 * problem must not look like maintenance, and the request fails on its own anyway.
 */
export async function getMaintenance(now = Date.now()): Promise<MaintenanceState> {
  if (cached && now - cached.at < TTL_MS) return cached.state;
  try {
    const state = await readMaintenance();
    cached = { at: now, state };
    return state;
  } catch {
    return OFF;
  }
}

/** The admin portal, the health check and the status line stay up so staff can switch it off. */
export function exemptFromMaintenance(pathname: string): boolean {
  return (
    pathname.startsWith('/api/v1/admin/') ||
    pathname === '/api/v1/health' ||
    pathname === '/api/v1/maintenance'
  );
}

/**
 * Switches it on or off. Switching on signs every phone-app session out (admin portal
 * sessions stay), so people must sign in again once it is off. Returns how many were signed out.
 */
export async function setMaintenance(
  input: { enabled: boolean; message?: string },
  now = new Date(),
) {
  const message = input.enabled && input.message ? input.message : null;
  const signedOut = await db.$transaction(async (tx) => {
    await tx.maintenanceMode.upsert({
      where: { id: 1 },
      create: { id: 1, enabled: input.enabled, message, enabledAt: input.enabled ? now : null },
      update: { enabled: input.enabled, message, enabledAt: input.enabled ? now : null },
    });
    if (!input.enabled) return 0;
    const res = await tx.session.updateMany({
      where: { kind: 'MOBILE', revokedAt: null },
      data: { revokedAt: now },
    });
    return res.count;
  });
  invalidateMaintenanceCache();
  return signedOut;
}
