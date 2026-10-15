/**
 * Field-level encryption for personal data (D35). See docs/KEY_MANAGEMENT.md.
 *
 * Envelope encryption:
 *   master key (env, versioned)  --wraps-->  per-user data key (random, stored wrapped)
 *   per-user data key            --encrypts-->  the user's email
 *
 * - AES-256-GCM everywhere: confidentiality plus tamper detection.
 * - Every ciphertext is bound to its user and purpose with "associated data", so an
 *   encrypted email copied onto another account's row fails to decrypt.
 * - Destroying a user's wrapped data key makes their encrypted data unrecoverable,
 *   including in old backups (crypto-shredding, D37).
 * - Lookups use a keyed hash (blind index) with a separate secret, so a leaked
 *   database can't be matched against lists of known emails.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { getEnv } from '../env';
import { parseKeyring, type Keyring } from './keyring';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FORMAT_V1 = 1;

let cached: Keyring | undefined;
export function getKeyring(): Keyring {
  const env = getEnv();
  cached ??= parseKeyring(env.ENCRYPTION_KEYS, env.ENCRYPTION_KEY_ID, env.EMAIL_INDEX_KEY);
  return cached;
}

/** Stored form: a plain byte array (what Prisma's Bytes columns expect). */
export type StoredBytes = Uint8Array<ArrayBuffer>;
const stored = (b: Buffer): StoredBytes => new Uint8Array(b);

// ───────────────────────── Low-level AES-GCM ─────────────────────────

/** [format][iv 12][tag 16][ciphertext] */
function seal(key: Buffer, plaintext: Buffer, aad: string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.from([FORMAT_V1]), iv, cipher.getAuthTag(), ct]);
}

function open(key: Buffer, blob: Buffer, aad: string): Buffer {
  if (blob.length < 1 + IV_BYTES + TAG_BYTES || blob[0] !== FORMAT_V1) {
    throw new Error('unrecognized ciphertext format');
  }
  const iv = blob.subarray(1, 1 + IV_BYTES);
  const tag = blob.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const ct = blob.subarray(1 + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

// ───────────────────────── Per-user data keys ─────────────────────────

const dekAad = (userId: string) => `jax:dek:${userId}`;

/** Wrapped key layout: [keyId length][keyId][sealed data key]. */
function wrap(userId: string, dek: Buffer, ring: Keyring): Buffer {
  const id = Buffer.from(ring.currentId, 'ascii');
  return Buffer.concat([
    Buffer.from([id.length]),
    id,
    seal(ring.keys.get(ring.currentId)!, dek, dekAad(userId)),
  ]);
}

/** Creates a random data key for a new user. Store `wrapped`; keep `dek` in memory only. */
export function createUserKey(userId: string, ring = getKeyring()) {
  const dek = randomBytes(32);
  return { dek, wrapped: stored(wrap(userId, dek, ring)) };
}

export function wrappedKeyId(wrapped: Uint8Array): string {
  return Buffer.from(wrapped.subarray(1, 1 + wrapped[0]!)).toString('ascii');
}

export function unwrapUserKey(userId: string, wrapped: Uint8Array, ring = getKeyring()): Buffer {
  const id = wrappedKeyId(wrapped);
  const kek = ring.keys.get(id);
  if (!kek) throw new Error(`master key ${id} is not loaded`);
  return open(kek, Buffer.from(wrapped.subarray(1 + wrapped[0]!)), dekAad(userId));
}

/** Key rotation: re-locks a user's data key under the current master key. Data is untouched. */
export function rewrapUserKey(
  userId: string,
  wrapped: Uint8Array,
  ring = getKeyring(),
): StoredBytes {
  return stored(wrap(userId, unwrapUserKey(userId, wrapped, ring), ring));
}

// ───────────────────────── Fields ─────────────────────────

const fieldAad = (userId: string, field: string) => `jax:user:${userId}:${field}`;

export function encryptField(
  userId: string,
  field: string,
  dek: Buffer,
  value: string,
): StoredBytes {
  return stored(seal(dek, Buffer.from(value, 'utf8'), fieldAad(userId, field)));
}

export function decryptField(userId: string, field: string, dek: Buffer, blob: Uint8Array): string {
  return open(dek, Buffer.from(blob), fieldAad(userId, field)).toString('utf8');
}

/** Convenience: decrypt a user's email from their stored row. */
export function decryptUserEmail(u: {
  id: string;
  dekWrapped: Uint8Array | null;
  emailEnc: Uint8Array | null;
}): string {
  if (!u.dekWrapped || !u.emailEnc) throw new Error('email is not available (shredded)');
  const dek = unwrapUserKey(u.id, u.dekWrapped);
  return decryptField(u.id, 'email', dek, u.emailEnc);
}

// ───────────────────────── Blind index ─────────────────────────

/** Keyed hash of a normalized (trimmed, lowercased) email, for lookup and uniqueness. */
export function emailIndex(email: string, ring = getKeyring()): string {
  return createHmac('sha256', ring.emailIndexKey)
    .update(`email:${email.trim().toLowerCase()}`)
    .digest('hex');
}

/** The three stored email fields for a new user (D35). Used by signup, the seed and tests. */
export function encryptedEmailFields(userId: string, email: string, ring = getKeyring()) {
  const { dek, wrapped } = createUserKey(userId, ring);
  return {
    emailIndex: emailIndex(email, ring),
    emailEnc: encryptField(userId, 'email', dek, email),
    dekWrapped: wrapped,
  };
}
