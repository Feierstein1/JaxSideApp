import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { DARK, type TopicView } from '@jax/shared';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { fetchTopics, topicActivity } from './api';

const CARD_WIDTH = 210;

function TopicCard({ t }: { t: TopicView }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.pinned ? 'Pinned topic' : 'Topic'}: ${t.title}. ${topicActivity(t)}`}
      onPress={() => router.push(`/topic/${t.id}`)}
      style={({ pressed }) => ({
        width: CARD_WIDTH,
        padding: SPACE.md,
        gap: 4,
        borderRadius: RADIUS.lg,
        backgroundColor: DARK.card,
        borderWidth: 1,
        borderColor: t.pinned ? DARK.accent : DARK.hairline,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Ionicons name={t.pinned ? 'pin' : 'chatbubbles-outline'} size={13} color={DARK.accent} />
        <Text style={[TYPE.caption, { color: DARK.accent, fontWeight: '800' }]}>
          {t.pinned ? 'PINNED' : 'TOPIC'}
        </Text>
      </View>
      <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: '700', minHeight: 38 }}>
        {t.title}
      </Text>
      <Text numberOfLines={1} style={[TYPE.caption, { color: DARK.textMuted }]}>
        {topicActivity(t)}
      </Text>
    </Pressable>
  );
}

/**
 * D125: "Citywide" at the top of Home: the open topics for all of Jacksonville (pinned first),
 * sideways, then a card to suggest one. "All topics" opens the full list.
 */
export function CitywideStrip({ reloadKey }: { reloadKey: string }) {
  const [topics, setTopics] = useState<TopicView[] | null>(null);
  useEffect(() => {
    let live = true;
    fetchTopics()
      .then((r) => live && setTopics(r.open))
      .catch(() => live && setTopics(null));
    return () => {
      live = false;
    };
  }, [reloadKey]);
  if (!topics) return null;

  return (
    <View style={{ gap: SPACE.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="globe-outline" size={16} color={DARK.accent} />
        <Text accessibilityRole="header" style={{ flex: 1, fontSize: 15, fontWeight: '800' }}>
          Citywide
        </Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.push('/topics')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
        >
          <Text style={{ color: DARK.accent, fontWeight: '700', fontSize: 13 }}>All topics</Text>
          <Ionicons name="chevron-forward" size={14} color={DARK.accent} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: SPACE.sm }}
      >
        {topics.map((t) => (
          <TopicCard key={t.id} t={t} />
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/suggest-topic')}
          style={({ pressed }) => ({
            width: topics.length ? 150 : CARD_WIDTH,
            padding: SPACE.md,
            gap: 6,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: RADIUS.lg,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: DARK.border,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Ionicons name="add-circle-outline" size={22} color={DARK.accent} />
          <Text style={{ fontWeight: '700', textAlign: 'center' }}>Suggest a topic</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
