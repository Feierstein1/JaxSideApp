import { randomBytes } from 'node:crypto';

/**
 * RFC 9562 UUIDv7 (time-ordered), matching the database default. Generated in the app
 * when a row's ID must be known before insert, e.g. to bind encrypted fields to it.
 */
export function uuidv7(now: number = Date.now()): string {
  const b = randomBytes(16);
  b.writeUIntBE(now, 0, 6); // 48-bit millisecond timestamp
  b[6] = (b[6]! & 0x0f) | 0x70; // version 7
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 10
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
