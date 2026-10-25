import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { DARK, TOPIC_CATEGORIES, type TopicView } from '@jax/shared';
import { DecoBox } from '@/deco';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { topicActivity } from './api';

/** D131: one citywide topic in a list: category, title, activity; opens the topic. */
export function TopicRow({ t }: { t: TopicView }) {
  const closed = t.status === 'closed';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${TOPIC_CATEGORIES[t.category]} topic: ${t.title}. ${topicActivity(t)}${closed ? '. Closed' : ''}`}
      onPress={() => router.push(`/citywide/topic/${t.id}`)}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      <DecoBox
        shape="chamfer"
        fill={DARK.card}
        stroke={t.pinned && !closed ? DARK.accent : undefined}
        style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.md }}
      >
        <Ionicons
          name={closed ? 'lock-closed-outline' : t.pinned ? 'pin' : 'chatbubbles-outline'}
          size={19}
          color={closed ? DARK.textMuted : DARK.accent}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[TYPE.caption, { color: DARK.accent, fontWeight: '700' }]}>
            {TOPIC_CATEGORIES[t.category]}
          </Text>
          <Text style={{ fontWeight: '700' }} numberOfLines={2}>
            {t.title}
          </Text>
          <Text style={[TYPE.caption, { color: DARK.textMuted }]}>{topicActivity(t)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={DARK.textMuted} />
      </DecoBox>
    </Pressable>
  );
}
