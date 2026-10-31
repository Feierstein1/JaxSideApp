import { emailSchema, passwordSchema } from '@jax/shared';
import { hashPassword } from '../src/server/crypto';
import { db } from '../src/server/db';

/**
 * Dev helper until the claim -> email invite flow exists (B1.3):
 *   BUSINESS_PASSWORD='...' npm run account:create -w @jax/business -- owner@example.com
 * The password comes from the environment so it stays out of the shell history.
 */
async function main() {
  const email = emailSchema.parse(process.argv[2]);
  const password = passwordSchema.parse(process.env.BUSINESS_PASSWORD);
  await db.businessAccount.create({ data: { email, passwordHash: await hashPassword(password) } });
  console.log(`Created business account ${email}`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
