import { Pressable, View } from 'react-native';
import { stopMedia } from '@/discussion/media-focus';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK } from '@jax/shared';
import { useAuth } from '@/auth/AuthContext';
import { Text } from '@/text';
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
        <View
          style={{
            position: 'absolute',
            // D247: bottom left, so the top of the screen can't cut the number off.
            bottom: -4,
            left: 0,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 4,
            backgroundColor: DARK.error,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: DARK.text, fontSize: 11, fontWeight: '800' }}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
