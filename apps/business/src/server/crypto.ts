import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/** `Algorithm.Argon2id` is an ambient const enum (unusable with isolatedModules); its value is 2. */
const ARGON2ID = 2;
// argon2id, OWASP baseline parameters (19 MiB, 2 iterations, 1 lane).
const ARGON2_OPTS = { algorithm: ARGON2ID, memoryCost: 19456, timeCost: 2, parallelism: 1 };

/** 256-bit random token, URL-safe. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tokens are high-entropy, so a plain SHA-256 is enough to store them. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

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

/** Makes "no such account" take as long as "wrong password", so timing doesn't reveal accounts. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword(generateToken());
  await verifyPassword(await dummyHash, password);
}
