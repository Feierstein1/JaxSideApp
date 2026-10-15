import { keyedHash } from './auth/crypto';
import { getEnv } from './env';

/**
 * Client IP for abuse controls. X-Forwarded-For is only trusted when TRUST_PROXY=true
 * (a reverse proxy we control sets it); otherwise any client could spoof it.
 * Without a trusted proxy, all clients share one "unknown" bucket (fine for local dev).
 */
export function clientIp(req: Request): string {
  if (getEnv().TRUST_PROXY) {
    const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}

/** Rate-limit subject for an IP: keyed hash, so raw IPs are never stored. */
export function ipSubject(req: Request): string {
  return keyedHash(clientIp(req), getEnv().SESSION_SECRET);
}
