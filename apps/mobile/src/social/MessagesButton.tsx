import { Pressable, View } from 'react-native';
import { stopMedia } from '@/discussion/media-focus';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK } from '@jax/shared';
import { useAuth } from '@/auth/AuthContext';
import { useUnreadMessages } from './messages-unread';

/** D98: the Messages button in the top bar, next to the bell, with an unread badge. */
export function MessagesButton() {
  const { state } = useAuth();
  const signedIn = state.status === 'signedIn';
  const count = useUnreadMessages(signedIn);
  if (!signedIn) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `Messages, ${count} unread` : 'Messages'}
      onPress={() => {
        stopMedia(); // D228
        router.push('/messages');
      }}
      hitSlop={8}
      style={{ paddingHorizontal: 6 }}
    >
      <Ionicons
        name={count ? 'chatbubbles' : 'chatbubbles-outline'}
        size={22}
        color={DARK.accent}
      />
      {count ? (
        // D267: a plain red dot on the icon's corner (a number was clipped by the header).
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: 3,
            width: 11,
            height: 11,
            borderRadius: 6,
            backgroundColor: DARK.error,
            borderWidth: 1.5,
            borderColor: DARK.bar,
          }}
        />
      ) : null}
    </Pressable>
  );
}
