import { Pressable, View } from 'react-native';
import { stopMedia } from '@/discussion/media-focus';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK } from '@jax/shared';
import { useAuth } from '@/auth/AuthContext';
import { useUnreadCount } from './unread';

/**
 * D76 / D79: the notification bell in the top bar: a round raised button like the username
 * pill beside it, gold when there's something new, with a red count badge. Signed-in only.
 */
export function Bell() {
  const { state } = useAuth();
  const signedIn = state.status === 'signedIn';
  const count = useUnreadCount(signedIn);
  if (!signedIn) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `Notifications, ${count} new` : 'Notifications'}
      onPress={() => {
        stopMedia(); // D228
        router.push('/notifications');
      }}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: DARK.raised,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons
        name={count ? 'notifications' : 'notifications-outline'}
        size={18}
        color={count ? DARK.accent : DARK.text}
      />
      {count ? (
        // D267: a plain red dot inside the button (a number hanging off the corner got clipped
        // by the header). The count is in the accessibility label and on the Notifications page.
        <View
          style={{
            position: 'absolute',
            top: 3,
            right: 3,
            width: 11,
            height: 11,
            borderRadius: 6,
            backgroundColor: DARK.error,
            borderWidth: 1.5,
            borderColor: DARK.raised,
          }}
        />
      ) : null}
    </Pressable>
  );
}
