import { db } from '../src/server/db';
import { sendDigests } from '../src/server/inbox';

/**
 * B1.8: the daily summary emails. Safe to run every hour (each login gets at most one a
 * day): `npm run notices:send -w @jax/business`. Scheduled with the deploy (B5).
 */
async function main() {
  const sent = await sendDigests();
  console.log(`Sent ${sent} summary email${sent === 1 ? '' : 's'}.`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
