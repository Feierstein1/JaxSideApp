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
