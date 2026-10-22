import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { contrastRatio, DARK, profileColor, type FriendActivityItem } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { postTime } from '@/format';
import { ProfileAvatar } from '@/profile/ProfileAvatar';
import { social } from '@/social/api';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { Bone, EmptyState, ErrorState, Pulse, SearchField, SectionTitle, Segmented } from '@/ui';
import { FriendsManager } from './manage';

/**
 * D76: the friends feed: "@bob posted near Riverside" / "@bob posted at Bold Bean". It
 * never shows the post itself; to read posts you still have to be nearby, like everyone.
 * D79: the same black strip as Home and Places (here: your friends and new requests),
 * then activity cards with each friend's color stripe.
 */
export default function FriendsFeed() {
  // D89: a switch between friend activity and your friends list, like Home's switches.
  // "Your friends" first and open by default (user 2026-10-22).
  const [view, setView] = useState<'activity' | 'friends'>('friends');
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim().replace(/^@/, '')), 350);
    return () => clearTimeout(t);
  }, [typed]);
  const [items, setItems] = useState<FriendActivityItem[]>();
  const [next, setNext] = useState<string | null>(null);
  const [incoming, setIncoming] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      setError(undefined);
      try {
        const [page, reqs] = await Promise.all([
          social.activity(before, q || undefined),
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
    },
    [q],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: DARK.page }}>
      <View
        style={{ backgroundColor: DARK.bar, paddingHorizontal: 12, paddingBottom: 12, gap: 10 }}
      >
        <Segmented
          stretch
          options={[
            {
              key: 'friends',
              label: incoming ? `Your friends (${incoming} new)` : 'Your friends',
              icon: 'people',
            },
            { key: 'activity', label: 'Friend activity', icon: 'pulse' },
          ]}
          value={view}
          onChange={(v) => setView(v as 'activity' | 'friends')}
        />
        {view === 'activity' ? (
          <SearchField
            label="Search friend activity"
            placeholder="Search friends by username"
            value={typed}
            onChangeText={setTyped}
            maxLength={21}
          />
        ) : null}
      </View>

      {view === 'friends' ? (
        <FriendsManager embedded />
      ) : (
        <FlatList
          data={items ?? []}
          keyExtractor={(i) => `${i.kind}:${i.id}`}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={loading && !!items?.length}
              onRefresh={() => void load()}
              tintColor={DARK.accent}
              colors={[DARK.onAccent]}
              progressBackgroundColor={DARK.accent}
            />
          }
          onEndReached={() => {
            if (!loading && next) void load(next);
          }}
          ListHeaderComponent={
            <>
              {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
              {items?.length ? <SectionTitle>Where your friends posted</SectionTitle> : null}
            </>
          }
          ListEmptyComponent={
            !items ? (
              error ? null : (
                <View style={{ paddingTop: SPACE.md }}>
                  <ActivitySkeleton />
                  <ActivitySkeleton />
                  <ActivitySkeleton />
                </View>
              )
            ) : (
              <EmptyState
                icon="people-outline"
                title={q ? `No recent posts from “${q}”` : 'No friend activity yet'}
                body={
                  q
                    ? 'Only friends’ posts from the last 3 days show here.'
                    : 'When your friends post in the last 3 days, you’ll see where here. Add friends from their profile (tap a name on any post) or from Your friends.'
                }
                action={
                  q
                    ? undefined
                    : {
                        label: 'Find friends',
                        icon: 'person-add',
                        onPress: () => setView('friends'),
                      }
                }
              />
            )
          }
          ListFooterComponent={
            loading && items?.length ? (
              <ActivityIndicator style={{ margin: 16 }} color={DARK.accent} />
            ) : null
          }
          renderItem={({ item }) => <ActivityRow item={item} />}
        />
      )}
    </View>
  );
}

function ActivityRow({ item }: { item: FriendActivityItem }) {
  const color = profileColor(item.author.color);
  const faint = contrastRatio(color.hex, DARK.card) < 2;
  const where = item.place ? item.place.name : item.area;
  const verb = item.place ? ' posted at ' : where ? ' posted near ' : ' posted nearby';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.author.username}${verb}${where ?? ''}, ${postTime(item.createdAt)}`}
      onPress={() =>
        item.place
          ? router.push(`/places/${item.place.id}`)
          : router.push(`/user/${encodeURIComponent(item.author.username)}`)
      }
      style={({ pressed }) => ({
        marginHorizontal: SPACE.md,
        marginVertical: 5,
        borderRadius: RADIUS.lg,
        overflow: 'hidden',
        backgroundColor: pressed ? DARK.raised : DARK.card,
      })}
    >
      {/* The friend's account color as a stripe, like posts (D79). */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 5,
          backgroundColor: color.hex,
          borderRightWidth: faint ? 1.5 : 0,
          borderRightColor: DARK.border,
        }}
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.md,
          paddingLeft: 17,
          paddingRight: 14,
          paddingVertical: 12,
        }}
      >
        <ProfileAvatar
          name={item.author.username}
          url={item.author.avatarUrl}
          size={44}
          ringColor={faint ? DARK.border : color.hex}
          fill={color.hex}
        />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ fontSize: 15.5, lineHeight: 21 }}>
            <Text style={{ fontWeight: '800' }}>{item.author.username}</Text>
            {verb}
            {where ? <Text style={{ fontWeight: '800' }}>{where}</Text> : null}
          </Text>
          <Text style={[TYPE.caption, { color: DARK.textMuted, marginTop: 2 }]}>
            {postTime(item.createdAt)}
          </Text>
        </View>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: item.place ? DARK.accentSoft : DARK.tealSoft,
          }}
        >
          <Ionicons
            name={item.place ? 'storefront' : 'location'}
            size={17}
            color={item.place ? DARK.accent : DARK.tealText}
          />
        </View>
      </View>
    </Pressable>
  );
}

function ActivitySkeleton() {
  return (
    <Pulse>
      <View
        style={{
          marginHorizontal: SPACE.md,
          marginVertical: 5,
          borderRadius: RADIUS.lg,
          backgroundColor: DARK.card,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          paddingLeft: 17,
        }}
      >
        <Bone w={44} h={44} r={22} />
        <View style={{ flex: 1, gap: 6 }}>
          <Bone w="75%" h={13} />
          <Bone w="30%" h={11} />
        </View>
      </View>
    </Pulse>
  );
}
