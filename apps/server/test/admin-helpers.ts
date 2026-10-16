import { ADMIN_COOKIE, CSRF_HEADER } from '@/server/admin/auth';
import { generateToken, hashToken } from '@/server/auth/crypto';
import { db } from '@/server/db';

/**
 * A ready admin session (skips the password + authenticator steps, which
 * `admin-auth.test.ts` covers). Returns headers for `callRoute`.
 */
export async function adminHeaders(adminId: string) {
  await db.user.update({ where: { id: adminId }, data: { totpEnabledAt: new Date() } });
  const token = generateToken();
  const csrf = generateToken();
  await db.session.create({
    data: {
      userId: adminId,
      kind: 'ADMIN',
      tokenHash: hashToken(token),
      csrfTokenHash: hashToken(csrf),
      expiresAt: new Date(Date.now() + 8 * 3_600_000),
    },
  });
  return { cookie: `${ADMIN_COOKIE}=${token}`, [CSRF_HEADER]: csrf };
}
