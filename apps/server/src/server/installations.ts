import type { Installation } from '@/generated/prisma/client';
import { generateToken, hashToken } from './auth/crypto';
import { db } from './db';
import { ApiError } from './http';
import { enforce } from './rate-limit';

/** Header the app sends on every request once it has an installation token (P2.7). */
export const INSTALLATION_HEADER = 'x-installation-token';
const TOUCH_INTERVAL_MS = 3_600_000;

/**
 * Issues a server-generated installation ID (§6.2, P2.7). This is NOT a hardware ID:
 * it identifies one install of the app, is reset by reinstalling, and is never shown
 * publicly. The app keeps the token in secure storage; only its hash is stored here.
 */
export async function createInstallation(ipSubject: string, now = new Date()) {
  await enforce(
    [
      {
        key: `installation:ip:${ipSubject}`,
        limitKey: 'rateLimit.installation.perHourPerIp',
        windowSeconds: 3600,
      },
    ],
    now,
  );
  const token = generateToken();
  await db.installation.create({
    data: {
      tokenHash: hashToken(token),
      createdAt: now,
      lastSeenAt: now,
      // P2.8: platform integrity checks are not wired up yet (see integrity.ts).
      integrityStatus: 'unverified',
    },
  });
  return { installationToken: token };
}

/**
 * The installation behind a request, or null if the header is missing or unknown.
 * An unknown token is not an error: the app simply registers a new installation.
 */
export async function resolveInstallation(
  req: Request,
  now = new Date(),
): Promise<Installation | null> {
  const token = req.headers.get(INSTALLATION_HEADER);
  if (!token || !/^[A-Za-z0-9_-]{20,200}$/.test(token)) return null;
  const inst = await db.installation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (inst && now.getTime() - inst.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.installation.update({ where: { id: inst.id }, data: { lastSeenAt: now } });
  }
  return inst;
}

/** Ban carry-over: a banned installation can't sign up or sign in (MS4, R2). */
export function assertInstallationNotBanned(inst: Installation | null): void {
  if (inst?.bannedAt) {
    throw new ApiError(403, 'INSTALLATION_BANNED', 'This device can no longer use Jax.');
  }
}
