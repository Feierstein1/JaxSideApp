import { router } from 'expo-router';
import type { TopicScope } from '@jax/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { useGuest } from '@/auth/guest';
import { showAlert } from '@/dialog';

/**
 * D133: start a topic of this kind (accounts with a confirmed email). D162: if the account is
 * still in a waiting period, one short notice says when, instead of opening the form.
 */
export function useStartTopic() {
  const { state } = useAuth();
  const { isGuest, promptAccount } = useGuest();
  return async (scope: TopicScope) => {
    if (isGuest) return promptAccount('start topics');
    if (state.status === 'signedIn' && !state.user.emailVerified) {
      showAlert('Confirm your email first', 'Enter the 6-digit code from your email in Account.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Go to Account', onPress: () => router.push('/account') },
      ]);
      return;
    }
    const check = await api
      .get<{ allowed: boolean; message?: string }>(`/api/v1/topics/allowance?scope=${scope}`)
      .catch(() => null); // can't check: open the form (creating checks again)
    if (check && !check.allowed) {
      showAlert('Not yet', check.message ?? 'You can start a topic a little later.', [
        { text: 'OK' },
      ]);
      return;
    }
    router.push({ pathname: '/citywide/new', params: { scope } });
  };
}
