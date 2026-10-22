import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { DARK, profileColor, type FriendUser } from '@jax/shared';
import { ProfileAvatar } from '@/profile/ProfileAvatar';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';

/**
 * D76 / D79: a person in a friends list or the bell, made to sit inside a `ListGroup`:
 * photo ringed in their account color, name (opens their profile), a line under it, and
 * actions on the right.
 */
export function FriendRow({
  user,
  children,
  subtitle,
  footnote,
}: {
  user: FriendUser;
  children?: ReactNode;
  subtitle?: ReactNode;
  /** A small one-line note along the bottom of the row, under the name (e.g. "Friends since"). */
  footnote?: string;
}) {
  const color = profileColor(user.color);
  return (
    <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.md,
          minHeight: 48,
        }}
      >
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ${user.username}'s profile`}
          onPress={() => router.push(`/user/${encodeURIComponent(user.username)}`)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.md,
            flex: 1,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <ProfileAvatar
            name={user.username}
            url={user.avatarUrl}
            size={44}
            ringColor={color.hex}
            fill={color.hex}
          />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '800' }}>
              {user.username}
            </Text>
            {subtitle ? (
              <Text numberOfLines={2} style={[TYPE.caption, { color: DARK.textMuted }]}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {children ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{children}</View>
        ) : null}
      </View>
      {footnote ? (
        <Text
          numberOfLines={1}
          style={{ color: DARK.textMuted, fontSize: 11.5, marginTop: 2, marginLeft: 44 + SPACE.md }}
        >
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}
