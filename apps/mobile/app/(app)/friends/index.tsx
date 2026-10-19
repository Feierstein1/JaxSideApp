import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BRAND, COLORS, type FriendActivityItem } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { timeAgo } from '@/format';
import { ProfileAvatar } from '@/profile/ProfileAvatar';
import { social } from '@/social/api';
import { Button, styles } from '@/ui';

/**
 * D76: the friends feed: "@bob posted near Riverside" / "@bob posted at Bold Bean". It
 * never shows the post itself; to read posts you still have to be nearby, like everyone.
 */
export default function FriendsFeed() {
  const [items, setItems] = useState<FriendActivityItem[]>();
  const [next, setNext] = useState<string | null>(null);
  const [incoming, setIncoming] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async (before?: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const [page, reqs] = await Promise.all([
        social.activity(before),
        before ? null : social.requests(),
      ]);
      setItems((prev) => (before ? [...(prev ?? []), ...page.items] : page.items));
      setNext(page.nextBefore);
      if (reqs) setIncoming(reqs.incoming.length);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load.');
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surfaceDark }}>
      <View
        style={{
          backgroundColor: COLORS.surfaceInverse,
          paddingHorizontal: 12,
          paddingTop: 4,
          paddingBottom: 12,
        }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/friends/manage')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            minHeight: 44,
            paddingHorizontal: 12,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: COLORS.onSurfaceInverse,
          }}
        >
          <Ionicons name="people" size={20} color={BRAND.gold} />
          <Text style={{ color: COLORS.onSurfaceInverse, fontWeight: '700', flex: 1 }}>
            Your friends and requests
          </Text>
          {incoming ? (
            <Text style={{ color: BRAND.gold, fontWeight: '800' }}>{incoming} new</Text>
          ) : null}
          <Ionicons name="chevron-forward" size={18} color={COLORS.onSurfaceInverse} />
        </Pressable>
      </View>
      {error ? (
        <View style={{ padding: 16 }}>
          <Text style={[styles.error, { color: COLORS.errorOnDark }]}>{error}</Text>
          <Button variant="linkOnDark" title="Try again" onPress={() => void load()} />
        </View>
      ) : null}
      {!items ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.accent} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => `${i.kind}:${i.id}`}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          onRefresh={() => void load()}
          refreshing={loading && !!items.length}
          onEndReached={() => {
            if (!loading && next) void load(next);
          }}
          ListEmptyComponent={
            <Text style={{ color: COLORS.onSurfaceDarkMuted, padding: 4 }}>
              When your friends post, you’ll see where here. Add friends from their profile (tap a
              name on any post) or from “Your friends and requests”.
            </Text>
          }
          renderItem={({ item }) => <ActivityRow item={item} />}
        />
      )}
    </View>
  );
}

function ActivityRow({ item }: { item: FriendActivityItem }) {
  const where = item.place ? `at ${item.place.name}` : item.area ? `near ${item.area}` : 'nearby';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.author.username} posted ${where}, ${timeAgo(item.createdAt)}`}
      onPress={() =>
        item.place
          ? router.push(`/places/${item.place.id}`)
          : router.push(`/user/${encodeURIComponent(item.author.username)}`)
      }
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 10,
        backgroundColor: COLORS.background,
      }}
    >
      <ProfileAvatar name={item.author.username} url={item.author.avatarUrl} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={styles.body}>
          <Text style={{ fontWeight: '800' }}>{item.author.username}</Text> posted {where}
        </Text>
        <Text style={styles.muted}>{timeAgo(item.createdAt)}</Text>
      </View>
      <Ionicons
        name={item.place ? 'storefront-outline' : 'location-outline'}
        size={20}
        color={COLORS.primary}
      />
    </Pressable>
  );
}
