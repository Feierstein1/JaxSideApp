import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, accountFromToken } from '@/server/auth';
import { ApiError } from '@/server/http';

/**
 * Every signed-in page calls this itself (not only a layout), because Next can render a
 * page without re-running its layout on client navigation. A forced password change
 * sends the person to /password before anything else.
 */
export async function requireAccount(opts: { passwordPage?: boolean } = {}) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  try {
    const { account } = await accountFromToken(token, {
      mutation: false,
      allowPasswordChange: true,
    });
    if (account.mustChangePassword && !opts.passwordPage) redirect('/password');
    return account;
  } catch (err) {
    if (err instanceof ApiError) redirect('/login');
    throw err;
  }
}
