import { Alert } from 'react-native';
import { useAuth } from './AuthContext';

/**
 * Guests (P4.2) can read the area feed and comment. The server refuses everything else;
 * this only explains why a button doesn't work and offers a way to sign up.
 */
export function useGuest() {
  const { state, signOut } = useAuth();
  const isGuest = state.status === 'guest';
  function promptAccount(what: string) {
    Alert.alert('Create a free account', `Guests can read and comment. To ${what}, sign up.`, [
      { text: 'Not now', style: 'cancel' },
      // Leaves guest mode; the guest identity stays on this install for later.
      { text: 'Sign up or sign in', onPress: () => void signOut() },
    ]);
  }
  return { isGuest, promptAccount };
}
