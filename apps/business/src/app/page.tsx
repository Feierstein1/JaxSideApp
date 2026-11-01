import Link from 'next/link';
import { COLORS } from '@jax/shared';
import { TEXT } from '@/text';
import { requireAccount } from './require-account';
import { SignOutButton } from './sign-out-button';

export default async function HomePage() {
  const account = await requireAccount();
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px' }}>
      <h1 style={{ marginTop: 0 }}>{TEXT.home.welcome}</h1>
      <p style={{ color: COLORS.textMuted }}>
        {TEXT.home.signedInAs} {account.email ?? account.username}
      </p>
      <p>{TEXT.home.placeholder}</p>
      <p>
        <Link href="/security">{TEXT.home.security}</Link>
      </p>
      <SignOutButton />
    </main>
  );
}
