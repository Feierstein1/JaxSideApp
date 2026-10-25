import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { DARK, TOPIC_CATEGORIES, type TopicView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useGuest } from '@/auth/guest';
import { DecoBox } from '@/deco';
import { showAlert } from '@/dialog';
import { haptic } from '@/motion';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { setFollow, topicDate } from './api';

/**
 * D133: one topic in a list: category, title, the date it was started, posts and followers,
 * and a Follow button. Tapping the card opens the topic.
 */
export function TopicCard({ t: initial }: { t: TopicView }) {
  const [t, setT] = useState(initial);
  const [busy, setBusy] = useState(false);
  const { isGuest, promptAccount } = useGuest();
  const closed = t.status === 'closed';

  async function toggleFollow() {
    if (isGuest) return promptAccount('follow topics');
    const next = !t.following;
    setBusy(true);
    // Show it right away; the server's count replaces the guess.
    setT({ ...t, following: next, followerCount: t.followerCount + (next ? 1 : -1) });
    try {
      const r = await setFollow(t.id, next);
      setT((cur) => ({ ...cur, following: r.following, followerCount: r.followerCount }));
      haptic.select();
    } catch (e) {
      setT(t);
      showAlert('Couldn’t update', e instanceof ApiRequestError ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${TOPIC_CATEGORIES[t.category]} topic: ${t.title}. Started ${topicDate(t.createdAt)}, ${t.postCount} posts, ${t.followerCount} following${closed ? '. Closed' : ''}`}
      onPress={() => router.push(`/citywide/topic/${t.id}`)}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <DecoBox
        shape="chamfer"
        fill={DARK.card}
        stroke={t.pinned && !closed ? DARK.accent : undefined}
        style={{ padding: SPACE.md, gap: 6 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons
            name={
              closed ? 'lock-closed-outline' : t.scope === 'local' ? 'navigate' : 'globe-outline'
            }
            size={13}
            color={closed ? DARK.textMuted : DARK.accent}
          />
          <Text style={[TYPE.caption, { flex: 1, color: DARK.accent, fontWeight: '700' }]}>
            {TOPIC_CATEGORIES[t.category]}
            {closed ? ' · Closed' : ''}
          </Text>
          <Text style={[TYPE.caption, { color: DARK.textMuted }]}>{topicDate(t.createdAt)}</Text>
        </View>
        <Text style={{ fontSize: 16, fontWeight: '800' }} numberOfLines={2}>
          {t.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="chatbubbles-outline" size={14} color={DARK.textMuted} />
            <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
              {t.postCount} {t.postCount === 1 ? 'post' : 'posts'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
            <Ionicons name="people-outline" size={14} color={DARK.textMuted} />
            <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
              {t.followerCount} following
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: t.following, busy }}
            accessibilityLabel={t.following ? 'Unfollow this topic' : 'Follow this topic'}
            onPress={() => void toggleFollow()}
            disabled={busy}
            hitSlop={6}
          >
            <DecoBox
              shape="arrow"
              cut={8}
              fill={t.following ? DARK.tealSoft : DARK.accent}
              stroke={t.following ? DARK.accent : undefined}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                height: 30,
                paddingHorizontal: 13,
              }}
            >
              <Ionicons
                name={t.following ? 'checkmark' : 'add'}
                size={14}
                color={t.following ? DARK.accent : DARK.onAccent}
              />
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: '800',
                  color: t.following ? DARK.accent : DARK.onAccent,
                }}
              >
                {t.following ? 'Following' : 'Follow'}
              </Text>
            </DecoBox>
          </Pressable>
        </View>
      </DecoBox>
    </Pressable>
  );
}
