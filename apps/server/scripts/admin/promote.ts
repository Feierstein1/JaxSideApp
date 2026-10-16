/**
 * P5.11 (D60): make an existing, confirmed account an admin, or remove admin access.
 * Admins are only ever created here, by someone with server access, never from the
 * app or the portal.
 *
 *   npm run admin:promote -w @jax/server -- <username>
 *   npm run admin:promote -w @jax/server -- <username> --remove
 *
 * Promoting resets two-step sign-in, so the person sets up their authenticator on
 * their first admin sign-in. Removing also ends their admin sessions.
 */
import { normalizeUsername } from '@jax/shared';
import { db } from '../../src/server/db';

async function main() {
  const [username, flag] = process.argv.slice(2);
  if (!username || (flag && flag !== '--remove')) {
    console.error('Usage: admin:promote <username> [--remove]');
    process.exit(2);
  }
  const user = await db.user.findUnique({
    where: { usernameNormalized: normalizeUsername(username) },
  });
  if (!user || user.status !== 'ACTIVE') {
    console.error(`No active account named ${username}.`);
    process.exit(1);
  }
  if (flag === '--remove') {
    await db.user.update({
      where: { id: user.id },
      data: { role: 'USER', totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null },
    });
    await db.session.updateMany({
      where: { userId: user.id, kind: 'ADMIN', revokedAt: null },
      data: { revokedAt: new Date() },
    });
    console.log(`${user.username} is no longer an admin.`);
    return;
  }
  if (!user.emailVerifiedAt) {
    console.error(`${user.username} hasn't confirmed their email yet.`);
    process.exit(1);
  }
  await db.user.update({
    where: { id: user.id },
    data: { role: 'ADMIN', totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null },
  });
  console.log(
    `${user.username} is now an admin. Sign in at /admin/login and set up the authenticator app.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
