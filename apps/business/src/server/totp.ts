import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { getEnv } from './env';

/**
 * TOTP (RFC 6238) for optional two-factor sign-in: 6 digits, 30-second steps, SHA-1, which
 * is what Google Authenticator, Microsoft Authenticator, 1Password etc. expect. Same
 * algorithm as the admin portal's; copied, not imported, so this site stands alone (D169).
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) throw new Error('invalid base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random 160-bit secret, base32 (what authenticator apps take). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export const timeStep = (now: Date) => Math.floor(now.getTime() / 1000 / STEP_SECONDS);

export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Checks a code against the current step and one step either side (clock drift).
 * Returns the matching step, or null. Callers reject steps at or before the last one
 * used, so a code can't be replayed.
 */
export function matchTotp(secret: string, code: string, now: Date): number | null {
  const clean = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const current = timeStep(now);
  for (const step of [current - 1, current, current + 1]) {
    const expected = Buffer.from(totpAt(secret, step));
    if (timingSafeEqual(expected, Buffer.from(clean))) return step;
  }
  return null;
}

export function otpauthUrl(secret: string, account: string): string {
  const issuer = 'JaxSide Business';
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// The secret is stored encrypted (AES-256-GCM), bound to the account it belongs to.
function secretKey(): Buffer {
  return Buffer.from(
    hkdfSync('sha256', getEnv().BUSINESS_SECRET, 'jax-business', 'totp-secret', 32),
  );
}

export function encryptTotpSecret(accountId: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
  cipher.setAAD(Buffer.from(accountId));
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

export function decryptTotpSecret(accountId: string, stored: string): string {
  const raw = Buffer.from(stored, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', secretKey(), raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(accountId));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}
