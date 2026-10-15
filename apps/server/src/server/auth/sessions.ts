import type { SessionKind } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { generateToken, hashToken } from './crypto';

const DAY_MS = 86_400_000;
/** Don't write lastUsedAt on every request; once an hour is enough for sliding expiry. */
const TOUCH_INTERVAL_MS = 3_600_000;

export async function createSession(userId: string, kind: SessionKind, now = new Date()) {
  const days = await getConfig('session.mobileDays');
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + days * DAY_MS);
  await db.session.create({
    data: { userId, kind, tokenHash: hashToken(token), expiresAt, createdAt: now, lastUsedAt: now },
  });
  return { token, expiresAt };
}

/** Finds a live session by raw token. Returns null for unknown, revoked or expired tokens. */
export async function findLiveSession(token: string, now = new Date()) {
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= now) return null;
  return session;
}

/** Sliding expiry for mobile sessions (D10). */
export async function touchSession(id: string, lastUsedAt: Date, now = new Date()) {
  if (now.getTime() - lastUsedAt.getTime() < TOUCH_INTERVAL_MS) return;
  const days = await getConfig('session.mobileDays');
  await db.session.update({
    where: { id },
    data: { lastUsedAt: now, expiresAt: new Date(now.getTime() + days * DAY_MS) },
  });
}

export async function revokeSession(id: string, now = new Date()) {
  await db.session.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: now } });
}

export async function revokeAllSessions(userId: string, now = new Date()) {
  const res = await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  });
  return res.count;
}
