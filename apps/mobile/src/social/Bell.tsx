import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK } from '@jax/shared';
import { useAuth } from '@/auth/AuthContext';
import { Text } from '@/text';
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
      onPress={() => router.push('/notifications')}
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
        <View
          style={{
            position: 'absolute',
            top: -5,
            right: -6,
            minWidth: 19,
            height: 19,
            borderRadius: 10,
            paddingHorizontal: 4,
            backgroundColor: DARK.error,
            borderWidth: 2,
            borderColor: DARK.bar,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Black on the light red badge (9:1). */}
          <Text style={{ color: DARK.onAccent, fontSize: 10.5, fontWeight: '800' }}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
