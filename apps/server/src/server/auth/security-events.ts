import { decryptUserEmail } from '../crypto/field-encryption';
import { db } from '../db';
import { logger } from '../logger';
import { sendSafely } from '../mail/mailer';
import { loginAlertEmail } from '../mail/templates';
import { hit } from '../rate-limit';
import { pageWindow, toPage } from '../admin/paging';

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

/** D180: how many sign-in bursts were blocked in the last day (the dashboard tile). */
export function securityEventsLastDay(now = new Date()) {
  return db.securityEvent.count({
    where: { createdAt: { gte: new Date(now.getTime() - 86_400_000) } },
  });
}

/** The Security page: bursts in the last day and the newest ones, 20 a page (D210). */
export async function recentSecurityEvents(page = 1, now = new Date()) {
  const [last24h, rows, total] = await Promise.all([
    securityEventsLastDay(now),
    db.securityEvent.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pageWindow(page),
      include: { user: { select: { username: true } } },
    }),
    db.securityEvent.count(),
  ]);
  return {
    last24h,
    events: toPage(
      rows.map((e) => ({
        id: e.id,
        kind: e.kind,
        userId: e.userId,
        username: e.user?.username ?? null,
        ipCode: e.ipCode,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
      page,
    ),
  };
}
