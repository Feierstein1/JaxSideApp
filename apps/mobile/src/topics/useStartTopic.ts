import { router } from 'expo-router';
import type { TopicScope } from '@jax/shared';
import { useAuth } from '@/auth/AuthContext';
import { useGuest } from '@/auth/guest';
import { showAlert } from '@/dialog';

/** D133: start a topic of this kind (accounts with a confirmed email). */
export function useStartTopic() {
  const { state } = useAuth();
  const { isGuest, promptAccount } = useGuest();
  return (scope: TopicScope) => {
    if (isGuest) return promptAccount('start topics');
    if (state.status === 'signedIn' && !state.user.emailVerified) {
      showAlert('Confirm your email first', 'Enter the 6-digit code from your email in Account.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Go to Account', onPress: () => router.push('/account') },
      ]);
      return;
    }
    router.push({ pathname: '/citywide/new', params: { scope } });
  };
}
