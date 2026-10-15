import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/** `Algorithm.Argon2id` is an ambient const enum (unusable with isolatedModules); its value is 2. */
const ARGON2ID = 2;

/** 256-bit random token, URL-safe. Used for sessions and email links. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Tokens are high-entropy, so a plain SHA-256 is enough to store them (D3, D10).
 * The database never holds a usable token.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Keyed hash for values that are low-entropy but must not be stored raw (e.g. IPs in rate-limit keys). */
export function keyedHash(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex').slice(0, 32);
}

/** D31: uniformly random 6-digit code, zero-padded. */
export function generateEmailCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Codes have only 10^6 values, so a plain hash could be reversed instantly from a DB
 * leak. HMAC with the server secret means the DB alone isn't enough.
 */
export function hashEmailCode(code: string, secret: string): string {
  return createHmac('sha256', secret).update(`email-code:${code}`).digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// argon2id, OWASP baseline parameters (19 MiB, 2 iterations, 1 lane).
const ARGON2_OPTS = { algorithm: ARGON2ID, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Runs a verify against a throwaway hash so "no such user" takes as long as "wrong password".
 * Avoids leaking which accounts exist through response timing.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword(generateToken());
  await verifyPassword(await dummyHash, password);
}
