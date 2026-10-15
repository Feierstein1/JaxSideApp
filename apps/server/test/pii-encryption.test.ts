import { createHash, randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as registerPOST } from '@/app/api/v1/auth/register/route';
import { invalidateConfigCache } from '@/server/config';
import {
  createUserKey,
  decryptField,
  decryptUserEmail,
  emailIndex,
  encryptField,
  rewrapUserKey,
  unwrapUserKey,
  wrappedKeyId,
} from '@/server/crypto/field-encryption';
import { parseKeyring } from '@/server/crypto/keyring';
import { uuidv7 } from '@/server/crypto/uuid';
import { db } from '@/server/db';
import { setMailer } from '@/server/mail/mailer';
import { resetDb } from './db-helpers';
import { call, captureMailer } from './http-helpers';
import { createTestUser } from './user-factory';

const k = () => randomBytes(32).toString('base64');
const ring = (ids: string[], current: string, keys: Record<string, string>) =>
  parseKeyring(ids.map((id) => `${id}:${keys[id]}`).join(','), current, k());

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  setMailer(captureMailer().mailer);
});

describe('what a leaked database contains (D35, D36)', () => {
  it('no plaintext email and no birth year anywhere in the user or token tables', async () => {
    const email = 'Leak.Test@Example.test';
    const r = await call(registerPOST, 'POST', {
      body: {
        username: 'leaky',
        email,
        password: 'correct horse battery',
        birthYear: 1990,
        acceptTerms: true,
        confirmAdult: true,
      },
    });
    expect(r.status).toBe(202);

    const dump = await db.$queryRaw<{ t: string }[]>`
      SELECT row_to_json(u)::text AS t FROM "User" u
      UNION ALL SELECT row_to_json(e)::text FROM "EmailToken" e`;
    const text = dump
      .map((d) => d.t)
      .join('\n')
      .toLowerCase();
    expect(text).not.toContain('leak.test@example.test');
    expect(text).not.toContain('leak.test');
    // Birth year: there is no column for it at all.
    const cols = await db.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'User'`;
    expect(cols.map((c) => c.column_name)).not.toContain('birthYear');
    expect(cols.map((c) => c.column_name)).not.toContain('email');

    // The server can still read it.
    const u = await db.user.findUniqueOrThrow({ where: { usernameNormalized: 'leaky' } });
    expect(decryptUserEmail(u)).toBe('leak.test@example.test');
    expect(u.ageCutoffYear).toBeLessThanOrEqual(new Date().getUTCFullYear() - 19);
  });

  it('the lookup hash is keyed: a plain hash of the email does not match it', async () => {
    const u = await createTestUser('hashy', { email: 'known@example.test' });
    const plainSha = createHash('sha256').update('known@example.test').digest('hex');
    expect(u.emailIndex).not.toBe(plainSha);
    expect(u.emailIndex).toBe(emailIndex('KNOWN@example.test ')); // normalized
  });
});

describe('ciphertext properties', () => {
  it('encrypting the same value twice gives different bytes (random IV)', () => {
    const id = uuidv7();
    const { dek } = createUserKey(id);
    const a = encryptField(id, 'email', dek, 'same@example.test');
    const b = encryptField(id, 'email', dek, 'same@example.test');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  // 🔒 An attacker who can write to the DB can't move one user's email onto another row.
  it("an encrypted email copied onto another user's row fails to decrypt", async () => {
    const a = await createTestUser('alice_x', { email: 'alice@example.test' });
    const b = await createTestUser('bob_x', { email: 'bob@example.test' });
    expect(() => decryptUserEmail({ ...b, emailEnc: a.emailEnc })).toThrow();
    expect(() => decryptUserEmail({ ...b, dekWrapped: a.dekWrapped })).toThrow();
  });

  // 🔒 Copying BOTH the encrypted email and its wrapped key still fails: both are bound
  // to the original user's ID, so an attacker can't make account B show A's address.
  it("copying both encrypted fields onto another user's row fails to decrypt", async () => {
    const a = await createTestUser('alice_y', { email: 'alice2@example.test' });
    const b = await createTestUser('bob_y', { email: 'bob2@example.test' });
    expect(() =>
      decryptUserEmail({ id: b.id, emailEnc: a.emailEnc, dekWrapped: a.dekWrapped }),
    ).toThrow();
  });

  it('a tampered ciphertext is rejected (authenticated encryption)', async () => {
    const u = await createTestUser('tamper', { email: 't@example.test' });
    const bad = Buffer.from(u.emailEnc!);
    bad[bad.length - 1]! ^= 0x01;
    expect(() => decryptUserEmail({ ...u, emailEnc: bad })).toThrow();
  });

  it('the email ciphertext cannot be read as a different field', () => {
    const id = uuidv7();
    const { dek } = createUserKey(id);
    const enc = encryptField(id, 'email', dek, 'x@example.test');
    expect(() => decryptField(id, 'newEmail', dek, enc)).toThrow();
  });
});

describe('master keys', () => {
  it('data keys locked with one master key cannot be opened with another', () => {
    const keys = { v1: k(), v2: k() };
    const id = uuidv7();
    const { wrapped } = createUserKey(id, ring(['v1'], 'v1', keys));
    const otherKeys = { v1: k() }; // same id, different key material
    expect(() => unwrapUserKey(id, wrapped, ring(['v1'], 'v1', otherKeys))).toThrow();
  });

  it('rotation: old data stays readable, rewrapping moves it to the new key', () => {
    const keys = { v1: k(), v2: k() };
    const id = uuidv7();
    const old = createUserKey(id, ring(['v1'], 'v1', keys));
    const enc = encryptField(id, 'email', old.dek, 'rot@example.test');

    const both = ring(['v1', 'v2'], 'v2', keys);
    expect(wrappedKeyId(old.wrapped)).toBe('v1');
    const rewrapped = rewrapUserKey(id, old.wrapped, both);
    expect(wrappedKeyId(rewrapped)).toBe('v2');

    // After rewrapping, v1 can be retired and the email is still readable.
    const v2only = ring(['v2'], 'v2', keys);
    expect(decryptField(id, 'email', unwrapUserKey(id, rewrapped, v2only), enc)).toBe(
      'rot@example.test',
    );
  });
});

describe('crypto-shredding (D37)', () => {
  it('once the data key is destroyed, the email cannot be recovered, even from a backup copy', async () => {
    const u = await createTestUser('shredme', { email: 'gone@example.test' });
    const backupOfCiphertext = u.emailEnc!; // e.g. an old database backup

    const shredded = await db.user.update({
      where: { id: u.id },
      data: { status: 'DELETED', deletedAt: new Date(), emailEnc: null, dekWrapped: null },
    });
    expect(() => decryptUserEmail(shredded)).toThrow(/shredded/);
    // Without the data key, the backup ciphertext is useless; any other key fails.
    expect(() => decryptField(u.id, 'email', randomBytes(32), backupOfCiphertext)).toThrow();
  });

  it('a banned account can keep only its lookup hash, which still blocks re-registration', async () => {
    const u = await createTestUser('banned1', { email: 'evader@example.test' });
    await db.user.update({
      where: { id: u.id },
      data: { status: 'BANNED', emailEnc: null, dekWrapped: null },
    });
    const r = await call(registerPOST, 'POST', {
      body: {
        username: 'fresh_start',
        email: 'evader@example.test',
        password: 'correct horse battery',
        birthYear: 1990,
        acceptTerms: true,
        confirmAdult: true,
      },
    });
    expect(r.status).toBe(202); // same response as always (no disclosure)...
    expect(await db.user.count()).toBe(1); // ...but no new account was created
  });
});

describe('database rules (D35)', () => {
  it('an active account must have its encrypted email', async () => {
    const u = await createTestUser('needsemail');
    await expect(
      db.user.update({ where: { id: u.id }, data: { emailEnc: null, dekWrapped: null } }),
    ).rejects.toThrow(/User_email_material_required/);
  });

  it('the encrypted email and its data key are removed together', async () => {
    const u = await createTestUser('pairs');
    await expect(
      db.user.update({
        where: { id: u.id },
        data: { status: 'DELETED', dekWrapped: null },
      }),
    ).rejects.toThrow(/User_email_material_pair/);
  });
});
