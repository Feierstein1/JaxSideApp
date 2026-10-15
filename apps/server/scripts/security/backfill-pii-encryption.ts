/**
 * One-time D35/D36 backfill between migration steps A and B: for every user without an
 * encrypted email, create a data key, encrypt the email, compute the lookup hash, and
 * record the age cutoff from their signup year. Idempotent (skips users already done).
 *
 *   npx tsx --env-file=../../.env scripts/security/backfill-pii-encryption.ts
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { CONFIG_DEFAULTS, currentYearInAppTimeZone } from '@jax/shared';
import { PrismaClient } from '../../src/generated/prisma/client';
import { createUserKey, emailIndex, encryptField } from '../../src/server/crypto/field-encryption';

async function main() {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    // Raw query: the old plaintext column disappears from the client after step B.
    const users = await db.$queryRaw<{ id: string; email: string; createdAt: Date }[]>`
      SELECT id, email, "createdAt" FROM "User" WHERE "emailEnc" IS NULL AND email IS NOT NULL`;
    for (const u of users) {
      const { dek, wrapped } = createUserKey(u.id);
      await db.user.update({
        where: { id: u.id },
        data: {
          dekWrapped: wrapped,
          emailEnc: encryptField(u.id, 'email', dek, u.email),
          emailIndex: emailIndex(u.email),
          ageCutoffYear:
            currentYearInAppTimeZone(u.createdAt) - CONFIG_DEFAULTS['age.birthYearOffset'],
        },
      });
    }
    console.log(`backfilled ${users.length} user(s)`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
