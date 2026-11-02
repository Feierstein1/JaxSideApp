import { decryptUserEmail } from '../crypto/field-encryption';
import { db } from '../db';
import { logger } from '../logger';
import { sendSafely } from '../mail/mailer';
import { loginAlertEmail } from '../mail/templates';
import { hit } from '../rate-limit';

/**
 * D180: a sign-in burst that filled the one-minute allowance (D175). It is written down for the
 * admin dashboard, and the account's own owner gets one "someone tried to sign in" email an hour.
 * The request that tripped it answers exactly like any other wrong password.
 */
export type BurstKind = 'LOGIN_BURST_ACCOUNT' | 'LOGIN_BURST_IP';

export async function noteLoginBurst(
  kind: BurstKind,
  userId: string | null,
  ipSubject: string,
  now: Date,
) {
  await db.securityEvent.create({
    data: { kind, userId, ipCode: ipSubject.slice(0, 12), createdAt: now },
  });
  // Not awaited: a known account must not answer a moment slower than an unknown one.
  if (kind === 'LOGIN_BURST_ACCOUNT' && userId) {
    void alertAccountOwner(userId, now).catch((err) =>
      logger.error({ err }, 'sign-in alert failed'),
    );
  }
}

async function alertAccountOwner(userId: string, now: Date) {
  if ((await hit(`login-alert:user:${userId}`, 3600, now)) > 1) return;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true, emailVerifiedAt: true, dekWrapped: true, emailEnc: true },
  });
  if (!user || user.status === 'DELETED' || !user.emailVerifiedAt) return;
  await sendSafely(loginAlertEmail(decryptUserEmail(user)), 'login-alert');
}

/** The dashboard: bursts in the last day and the newest ones (admin pages only). */
export async function recentSecurityEvents(now = new Date(), limit = 100) {
  const since = new Date(now.getTime() - 86_400_000);
  const [last24h, rows] = await Promise.all([
    db.securityEvent.count({ where: { createdAt: { gte: since } } }),
    db.securityEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { username: true } } },
    }),
  ]);
  return {
    last24h,
    events: rows.map((e) => ({
      id: e.id,
      kind: e.kind,
      userId: e.userId,
      username: e.user?.username ?? null,
      ipCode: e.ipCode,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
