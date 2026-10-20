import { useAuth } from './AuthContext';
import { showAlert } from '@/dialog';

/**
 * Guests are view-only (D54): they browse area posts and comments. The server refuses
 * everything else; this only explains why a button doesn't work and offers sign-up.
 */
export function useGuest() {
  const { state, signOut } = useAuth();
  const isGuest = state.status === 'guest';
  function promptAccount(what: string) {
    showAlert(
      'Create a free account',
      `Guests can browse posts in their area. To ${what}, sign up.`,
      [
        { text: 'Not now', style: 'cancel' },
        // Leaves guest mode; the guest identity stays on this install for later.
        { text: 'Sign up or sign in', onPress: () => void signOut() },
      ],
      { icon: 'person-add-outline', tone: 'info' },
    );
  }
  return { isGuest, promptAccount };
}
