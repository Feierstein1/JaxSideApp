import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BRAND, COLORS } from '@jax/shared';
import { useAuth } from '@/auth/AuthContext';
import { useUnreadCount } from './unread';

/** D76: the notification bell in the top bar, with an unread badge. Signed-in only. */
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
      hitSlop={8}
      style={{ paddingHorizontal: 6 }}
    >
      <Ionicons
        name={count ? 'notifications' : 'notifications-outline'}
        size={22}
        color={BRAND.gold}
      />
      {count ? (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: 0,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 4,
            backgroundColor: COLORS.error,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: COLORS.onPrimary, fontSize: 11, fontWeight: '800' }}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
