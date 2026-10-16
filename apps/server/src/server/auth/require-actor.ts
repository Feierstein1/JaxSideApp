import type { User } from '@/generated/prisma/client';
import { ApiError } from '../http';
import { assertGuestUsable, findGuest, touchGuest, type LiveGuest } from './guests';
import { findLiveSession, revokeSession, touchSession } from './sessions';
import { assertAccountUsable } from './standing';

export interface RequireUserOptions {
  /** D11: posting and other writes need a verified email; reading does not. */
  requireVerifiedEmail?: boolean;
}

const BEARER = /^Bearer ([A-Za-z0-9_-]{20,200})$/;

function bearer(req: Request): string {
  const match = BEARER.exec(req.headers.get('authorization') ?? '');
  if (!match) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in');
  return match[1]!;
}

async function userFromToken(token: string, opts: RequireUserOptions, now: Date) {
  const session = await findLiveSession(token, now);
  // Admin portal sessions only work on admin routes (cookie + CSRF, D3).
  if (!session || session.kind !== 'MOBILE') return null;
  try {
    assertAccountUsable(session.user, now);
  } catch (err) {
    // Deleted accounts lose their sessions for good. Banned/suspended keep the
    // session so the app can show why, but every guarded action is refused.
    if (err instanceof ApiError && err.status === 401) await revokeSession(session.id, now);
    throw err;
  }
  if (opts.requireVerifiedEmail && !session.user.emailVerifiedAt) {
    throw new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Confirm your email address first');
  }
  await touchSession(session.id, session.lastUsedAt, now);
  return { user: session.user, session };
}

async function liveGuest(token: string, now: Date): Promise<LiveGuest | null> {
  const guest = await findGuest(token);
  if (!guest) return null;
  assertGuestUsable(guest, now);
  return guest;
}

/**
 * Central auth guard for registered users (P1.18). Every authenticated route calls this
 * (or requireActor) first. Identity, role and status come only from the database.
 * A valid guest token gets a clear 403 instead of a confusing "please sign in" (P4.2).
 */
export async function requireUser(req: Request, opts: RequireUserOptions = {}, now = new Date()) {
  const token = bearer(req);
  const found = await userFromToken(token, opts, now);
  if (found) return found;
  if (await liveGuest(token, now)) {
    throw new ApiError(403, 'GUEST_NOT_ALLOWED', 'Create a free account to do this.');
  }
  throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in');
}

export type Actor = { kind: 'user'; user: User } | { kind: 'guest'; guest: LiveGuest };

/**
 * For the few routes guests may use (P4.2: the general feed, general posts and
 * commenting on them). Returns the registered user or the guest.
 */
export async function requireActor(
  req: Request,
  opts: RequireUserOptions = {},
  now = new Date(),
): Promise<Actor> {
  const token = bearer(req);
  const found = await userFromToken(token, opts, now);
  if (found) return { kind: 'user', user: found.user };
  const guest = await liveGuest(token, now);
  if (!guest) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in');
  await touchGuest(guest, now);
  return { kind: 'guest', guest };
}
