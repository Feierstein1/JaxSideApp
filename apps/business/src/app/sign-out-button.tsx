'use client';

import { useRouter } from 'next/navigation';
import { TEXT } from '@/text';
import { post } from './client';
import { ui } from './ui';

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await post('/api/auth/logout').catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }
  return (
    <button type="button" onClick={signOut} style={ui.secondary}>
      {TEXT.home.signOut}
    </button>
  );
}
