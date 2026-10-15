import type { GuestSession, Installation } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { enforce } from '../rate-limit';
import { generateToken, hashToken } from './crypto';

const DAY_MS = 86_400_000;
const TOUCH_INTERVAL_MS = 3_600_000;

export type LiveGuest = GuestSession & { installation: Installation };

/**
 * P4.1 / P4.6: start (or resume) guest mode for an app installation.
 * - An installation token is required (P2.7): guests are tied to an install.
 * - A banned installation, or one that ever had a banned guest, gets nothing (MS4).
 * - One guest per installation: asking again issues a new token for the same guest
 *   (the old token stops working) rather than a fresh identity.
 * - Rate-limited per installation per day and per IP per hour.
 */
export async function startGuestSession(
  installation: Installation | null,
  ipSubject: string,
  now = new Date(),
) {
  if (!installation) {
    throw new ApiError(400, 'INSTALLATION_REQUIRED', 'Please update the app and try again.');
  }
  if (installation.bannedAt) {
    throw new ApiError(403, 'INSTALLATION_BANNED', 'This device can no longer use Jax.');
  }
  const bannedGuest = await db.guestSession.findFirst({
    where: {
      installationId: installation.id,
      OR: [{ status: 'BANNED' }, { bannedAt: { not: null } }],
    },
    select: { id: true },
  });
  if (bannedGuest) {
    throw new ApiError(403, 'INSTALLATION_BANNED', 'This device can no longer use Jax.');
  }
  await enforce(
    [
      {
        key: `guest-start:installation:${installation.id}`,
        limitKey: 'rateLimit.guestSession.perDayPerInstallation',
        windowSeconds: 86_400,
      },
      {
        key: `guest-start:ip:${ipSubject}`,
        limitKey: 'rateLimit.guestSession.perHourPerIp',
        windowSeconds: 3600,
      },
    ],
    now,
  );

  const days = await getConfig('guest.inactivityDays');
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + days * DAY_MS);
  const existing = await db.guestSession.findFirst({
    where: { installationId: installation.id, status: 'ACTIVE', expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
  });
  const guest = existing
    ? await db.guestSession.update({
        where: { id: existing.id },
        data: { tokenHash: hashToken(token), lastActiveAt: now, expiresAt },
      })
    : await db.guestSession.create({
        data: {
          tokenHash: hashToken(token),
          installationId: installation.id,
          lastActiveAt: now,
          expiresAt,
        },
      });
  return { token, guest };
}

/** The guest behind a token, if any; checks expiry and bans (P4.4, P4.6). */
export async function findGuest(token: string): Promise<LiveGuest | null> {
  return db.guestSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { installation: true },
  });
}

export function assertGuestUsable(g: LiveGuest, now = new Date()): void {
  if (g.status === 'BANNED' || g.bannedAt || g.installation.bannedAt) {
    throw new ApiError(403, 'GUEST_BANNED', 'This guest session has been banned.');
  }
  if (g.status === 'EXPIRED' || g.expiresAt <= now) {
    throw new ApiError(
      401,
      'GUEST_EXPIRED',
      'Your guest session expired. Start a new one or create an account.',
    );
  }
}

/** Inactivity is server-side (§5.1): each use pushes expiry out, written at most hourly. */
export async function touchGuest(g: LiveGuest, now = new Date()) {
  if (now.getTime() - g.lastActiveAt.getTime() < TOUCH_INTERVAL_MS) return;
  const days = await getConfig('guest.inactivityDays');
  await db.guestSession.update({
    where: { id: g.id },
    data: { lastActiveAt: now, expiresAt: new Date(now.getTime() + days * DAY_MS) },
  });
}

/** What the app shows a guest about their session (P4.4 expiry warning). */
export async function guestStatus(g: GuestSession, now = new Date()) {
  const [warnDays, canComment] = await Promise.all([
    getConfig('guest.expiryWarningDays'),
    getConfig('guest.commentsEnabled'),
  ]);
  const daysLeft = Math.max(0, Math.ceil((g.expiresAt.getTime() - now.getTime()) / DAY_MS));
  return {
    expiresAt: g.expiresAt.toISOString(),
    daysLeft,
    expiringSoon: daysLeft <= warnDays,
    // UX hint only; commentCreate checks the setting itself (D51).
    canComment,
  };
}
