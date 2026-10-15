import { randomUUID } from 'node:crypto';
import { encryptedEmailFields } from '@/server/crypto/field-encryption';
import { uuidv7 } from '@/server/crypto/uuid';
import { db } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';

/** Inserts a user directly (bypassing signup) with properly encrypted email fields (D35). */
export async function createTestUser(
  username: string,
  overrides: Partial<Prisma.UserUncheckedCreateInput> & { email?: string } = {},
) {
  const { email = `${randomUUID()}@example.test`, ...rest } = overrides;
  const id = uuidv7();
  return db.user.create({
    data: {
      id,
      username,
      usernameNormalized: username.toLowerCase(),
      ...encryptedEmailFields(id, email),
      passwordHash: 'x',
      ageCutoffYear: 2007,
      tosAcceptedAt: new Date(),
      tosVersion: 'test',
      adultConfirmedAt: new Date(),
      ...rest,
    },
  });
}

/** A guest session on a fresh installation. */
export async function createTestGuest(expiresAt = new Date(Date.now() + 86_400_000)) {
  const inst = await db.installation.create({
    data: { tokenHash: randomUUID().replace(/-/g, '').padEnd(64, '0') },
  });
  return db.guestSession.create({
    data: {
      tokenHash: randomUUID().replace(/-/g, '').padEnd(64, '1'),
      installationId: inst.id,
      expiresAt,
    },
  });
}
