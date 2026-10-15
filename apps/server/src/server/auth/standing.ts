import type { AccountStatus } from '@/generated/prisma/client';
import { ApiError } from '../http';

interface StandingFields {
  status: AccountStatus;
  suspendedUntil: Date | null;
  deletedAt: Date | null;
}

/**
 * Account-standing gate shared by login and requireActor() (§4.4, §11.3).
 * Deleted accounts look like "no account" (401). Banned and suspended accounts get
 * an explicit 403 so the user knows why. A suspension whose end time has passed no
 * longer blocks.
 */
export function assertAccountUsable(u: StandingFields, now: Date = new Date()): void {
  if (u.status === 'DELETED' || u.deletedAt) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in');
  }
  if (u.status === 'BANNED') {
    throw new ApiError(403, 'ACCOUNT_BANNED', 'This account has been banned');
  }
  if (u.status === 'SUSPENDED' && (!u.suspendedUntil || u.suspendedUntil > now)) {
    throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended', {
      until: u.suspendedUntil?.toISOString() ?? null,
    });
  }
}
