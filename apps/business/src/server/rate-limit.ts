import { createHmac } from 'node:crypto';
import { db } from './db';
import { getEnv } from './env';
import { ApiError } from './http';

/**
 * Fixed-window rate limits in Postgres. The counters share the app's RateLimitCounter
 * table (same database) under `biz:` keys, so the app's cleanup job removes them too.
 * Never put raw personal data in a key: IPs and sign-in names are hashed.
 */

export interface LimitRule {
  key: string;
  limit: number;
  windowSeconds: number;
}

export const LIMITS = {
  loginPerIp: { limit: 30, windowSeconds: 900 },
  loginPerIdentifier: { limit: 10, windowSeconds: 900 },
  twoFactorPerAccount: { limit: 10, windowSeconds: 900 },
  passwordChangePerAccount: { limit: 10, windowSeconds: 3600 },
  /** Every other signed-in change. */
  writePerAccount: { limit: 60, windowSeconds: 60 },
} as const;

export function subject(value: string): string {
  return createHmac('sha256', getEnv().BUSINESS_SECRET)
    .update(`rate:${value}`)
    .digest('hex')
    .slice(0, 32);
}

/** Client IP; X-Forwarded-For is trusted only behind our own proxy (TRUST_PROXY). */
export function clientIp(req: Request): string {
  if (getEnv().TRUST_PROXY) {
    const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}

async function hit(key: string, windowSeconds: number, now: Date): Promise<number> {
  const ms = windowSeconds * 1000;
  const start = new Date(Math.floor(now.getTime() / ms) * ms);
  const expires = new Date(start.getTime() + ms);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitCounter" (key, "windowStart", count, "expiresAt")
    VALUES (${key}, ${start}, 1, ${expires})
    ON CONFLICT (key, "windowStart") DO UPDATE SET count = "RateLimitCounter".count + 1
    RETURNING count`;
  return rows[0]!.count;
}

/** Counts this request against every rule; throws 429 if any is over its limit. */
export async function enforce(rules: LimitRule[], now = new Date()): Promise<void> {
  for (const r of rules) {
    if ((await hit(`biz:${r.key}`, r.windowSeconds, now)) > r.limit) {
      const ms = r.windowSeconds * 1000;
      const wait = Math.max(1, Math.ceil((ms - (now.getTime() % ms)) / 1000));
      throw new ApiError(
        429,
        'RATE_LIMITED',
        `Too many tries. Please wait ${Math.ceil(wait / 60)} minutes and try again.`,
        { retryAfterSeconds: wait },
      );
    }
  }
}
