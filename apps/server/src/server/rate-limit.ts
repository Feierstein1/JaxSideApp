import type { ConfigKey } from '@jax/shared';
import { getConfig } from './config';
import { db } from './db';
import { ApiError } from './http';

/**
 * Fixed-window rate limiting in Postgres (D8). One row per (key, window).
 * Limits come from AppConfiguration so they can be tuned without a deploy.
 */

export interface LimitRule {
  /** Bucket + subject, e.g. `login:ip:<hash>`. Never put raw PII in a key. */
  key: string;
  limitKey: ConfigKey;
  windowSeconds: number;
}

function windowStart(now: Date, windowSeconds: number, offsetMs = 0): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor((now.getTime() - offsetMs) / ms) * ms + offsetMs);
}

function retryAfter(now: Date, windowSeconds: number, offsetMs = 0): number {
  const end = windowStart(now, windowSeconds, offsetMs).getTime() + windowSeconds * 1000;
  return Math.max(1, Math.ceil((end - now.getTime()) / 1000));
}

/**
 * Fixed windows let two requests just either side of a boundary both through, which
 * matters for short burst limits (D55). For windows up to a minute, each request is
 * also counted in a second set of windows shifted by half a window: any two requests
 * less than half a window apart then always share a window.
 */
const STAGGER_UP_TO_SECONDS = 60;

/** Atomically increments the counter and returns the new count. */
export async function hit(
  key: string,
  windowSeconds: number,
  now = new Date(),
  offsetMs = 0,
): Promise<number> {
  const start = windowStart(now, windowSeconds, offsetMs);
  const expires = new Date(start.getTime() + windowSeconds * 1000);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitCounter" (key, "windowStart", count, "expiresAt")
    VALUES (${key}, ${start}, 1, ${expires})
    ON CONFLICT (key, "windowStart") DO UPDATE SET count = "RateLimitCounter".count + 1
    RETURNING count`;
  return rows[0]!.count;
}

/** Current count without incrementing. */
export async function peek(key: string, windowSeconds: number, now = new Date()): Promise<number> {
  const row = await db.rateLimitCounter.findUnique({
    where: { key_windowStart: { key, windowStart: windowStart(now, windowSeconds) } },
  });
  return row?.count ?? 0;
}

/** "a few seconds", "3 minutes", "2 hours": for the 429 message. */
export function waitText(seconds: number): string {
  if (seconds < 15) return 'a few seconds';
  if (seconds < 90) return `${seconds} seconds`;
  if (seconds < 5400) return `${Math.ceil(seconds / 60)} minutes`;
  return `${Math.ceil(seconds / 3600)} hours`;
}

function tooMany(now: Date, windowSeconds: number, offsetMs = 0): ApiError {
  const wait = retryAfter(now, windowSeconds, offsetMs);
  return new ApiError(
    429,
    'RATE_LIMITED',
    `You’re doing that too often. Try again in ${waitText(wait)}.`,
    { retryAfterSeconds: wait },
  );
}

/** Counts this request against every rule; throws 429 if any limit is exceeded. */
export async function enforce(rules: LimitRule[], now = new Date()): Promise<void> {
  for (const r of rules) {
    const limit = (await getConfig(r.limitKey)) as number;
    const count = await hit(r.key, r.windowSeconds, now);
    if (count > limit) throw tooMany(now, r.windowSeconds);
    if (r.windowSeconds <= STAGGER_UP_TO_SECONDS) {
      const half = (r.windowSeconds * 1000) / 2;
      const shifted = await hit(`${r.key}~`, r.windowSeconds, now, half);
      if (shifted > limit) throw tooMany(now, r.windowSeconds, half);
    }
  }
}

/** Throws 429 if the rule is already at its limit, without counting this request. */
export async function assertUnder(rule: LimitRule, now = new Date()): Promise<void> {
  const limit = await getConfig(rule.limitKey);
  if ((await peek(rule.key, rule.windowSeconds, now)) >= (limit as number)) {
    throw tooMany(now, rule.windowSeconds);
  }
}

/** Removes expired counters. Call from a scheduled job. */
export async function purgeExpiredCounters(now = new Date()): Promise<number> {
  const res = await db.rateLimitCounter.deleteMany({ where: { expiresAt: { lt: now } } });
  return res.count;
}
