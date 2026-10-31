import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COLORS } from '@jax/shared';
import { SESSION_COOKIE, accountFromToken } from '@/server/auth';
import { ApiError } from '@/server/http';
import { TEXT } from '@/text';
import { SignOutButton } from './sign-out-button';

/** Every page checks the session itself (not only a layout), as the admin portal does. */
async function requireAccount() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  try {
    return (await accountFromToken(token, { mutation: false })).account;
  } catch (err) {
    if (err instanceof ApiError) redirect('/login');
    throw err;
  }
}

export default async function HomePage() {
  const account = await requireAccount();
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px' }}>
      <h1 style={{ marginTop: 0 }}>{TEXT.home.welcome}</h1>
      <p style={{ color: COLORS.textMuted }}>
        {TEXT.home.signedInAs} {account.email}
      </p>
      <p>{TEXT.home.placeholder}</p>
      <SignOutButton />
    </main>
  );
}
