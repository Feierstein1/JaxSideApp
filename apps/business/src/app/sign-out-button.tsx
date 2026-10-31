'use client';

import { useRouter } from 'next/navigation';
import { COLORS } from '@jax/shared';
import { TEXT } from '@/text';

function csrfToken(): string {
  const match = document.cookie.split('; ').find((c) => c.startsWith('jax_biz_csrf='));
  return match ? decodeURIComponent(match.slice('jax_biz_csrf='.length)) : '';
}

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'x-csrf-token': csrfToken() } });
    router.replace('/login');
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={signOut}
      style={{
        padding: '10px 18px',
        borderRadius: 8,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.background,
        color: COLORS.text,
        cursor: 'pointer',
      }}
    >
      {TEXT.home.signOut}
    </button>
  );
}
