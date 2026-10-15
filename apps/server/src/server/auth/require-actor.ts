import { ApiError } from '../http';
import { findLiveSession, revokeSession, touchSession } from './sessions';
import { assertAccountUsable } from './standing';

export interface RequireUserOptions {
  /** D11: posting and other writes need a verified email; reading does not. */
  requireVerifiedEmail?: boolean;
}

const BEARER = /^Bearer ([A-Za-z0-9_-]{20,200})$/;

/**
 * Central auth guard (P1.18). Every authenticated route calls this first.
 * Identity, role and status come only from the database, never from the request body.
 */
export async function requireUser(req: Request, opts: RequireUserOptions = {}, now = new Date()) {
  const match = BEARER.exec(req.headers.get('authorization') ?? '');
  if (!match) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in');

  const session = await findLiveSession(match[1]!, now);
  if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in');

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
