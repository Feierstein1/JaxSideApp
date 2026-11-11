import { Pressable } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK } from '@jax/shared';
import { useAuth } from '@/auth/AuthContext';
import { useGuest } from '@/auth/guest';
import { stopMedia } from '@/discussion/media-focus';

/**
 * D230: Friends in the top bar, next to Messages and the bell (its bottom tab became Events).
 * Friend requests still arrive in the bell. Accounts only (D76).
 */
export function FriendsButton() {
  const { state } = useAuth();
  const { isGuest } = useGuest();
  if (state.status !== 'signedIn' || isGuest) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Friends"
      onPress={() => {
        stopMedia(); // D228
        router.push('/friends');
      }}
      hitSlop={8}
      style={{ paddingHorizontal: 6 }}
    >
      <Ionicons name="people-outline" size={22} color={DARK.accent} />
    </Pressable>
  );
}
