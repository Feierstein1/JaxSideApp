import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { COLORS, type FriendUser } from '@jax/shared';
import { ProfileAvatar } from '@/profile/ProfileAvatar';
import { styles } from '@/ui';

/** D76: a person in a friends list or the bell: photo, name (opens profile), actions. */
export function FriendRow({
  user,
  children,
  subtitle,
}: {
  user: FriendUser;
  children?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.cardBorder,
      }}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open ${user.username}'s profile`}
        onPress={() => router.push(`/user/${encodeURIComponent(user.username)}`)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
      >
        <ProfileAvatar name={user.username} url={user.avatarUrl} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.body, { fontWeight: '700' }]}>{user.username}</Text>
          {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
        </View>
      </Pressable>
      {children}
    </View>
  );
}
