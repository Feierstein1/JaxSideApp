import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { DARK, type PollView, type TopicView } from '@jax/shared';
import { fetchPolls, pollWhen } from '@/polls/api';
import { Text } from '@/text';
import { fetchTopics, topicActivity } from '@/topics/api';
import { RADIUS, SPACE } from '@/tokens';

/**
 * D126: one shared space on Home, between search and the post-type tabs.
 * - While there's an open poll you can answer, the poll takes the space.
 * - Once you've voted (or there's no poll for you), Citywide topics appear in its place:
 *   a short sideways row, newest first, with "See all" for the full, searchable list.
 * Accounts that can't vote yet (guests, unconfirmed, brand new) go straight to Citywide.
 * Reloads whenever Home comes back into view, so voting swaps it right away.
 */
export function HomeSlot({ reloadKey }: { reloadKey: string }) {
  const [poll, setPoll] = useState<PollView | null>(null);
  const [topics, setTopics] = useState<TopicView[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void Promise.all([fetchPolls().catch(() => null), fetchTopics().catch(() => null)]).then(
        ([polls, t]) => {
          if (!live) return;
          setPoll(polls?.open.find((p) => p.canVote) ?? null);
          setTopics(
            t ? [...t.open].sort((a, b) => Date.parse(b.opensAt) - Date.parse(a.opensAt)) : null,
          );
        },
      );
      return () => {
        live = false;
      };
    }, [reloadKey]),
  );

  if (poll) return <PollPrompt poll={poll} />;
  if (topics) return <CitywideRow topics={topics} />;
  return null;
}

/** The poll in the shared space: one line of question, and a Vote button. */
function PollPrompt({ poll }: { poll: PollView }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Poll of the week: ${poll.question}. Tap to vote. ${pollWhen(poll)}`}
      onPress={() => router.push(`/poll/${poll.id}`)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.sm,
        height: 56,
        paddingHorizontal: SPACE.md,
        borderRadius: RADIUS.lg,
        backgroundColor: DARK.card,
        borderWidth: 1,
        borderColor: DARK.accent,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name="checkbox-outline" size={20} color={DARK.accent} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: DARK.accent, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }}>
          POLL OF THE WEEK
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: '700' }}>
          {poll.question}
        </Text>
      </View>
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: RADIUS.pill,
          backgroundColor: DARK.accent,
        }}
      >
        <Text style={{ color: DARK.onAccent, fontWeight: '800', fontSize: 13 }}>Vote</Text>
      </View>
    </Pressable>
  );
}

const ROW_HEIGHT = 48;

/** Citywide topics in the shared space: newest first, sideways, then "See all". */
function CitywideRow({ topics }: { topics: TopicView[] }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: SPACE.sm }}
        accessibilityLabel="Citywide topics, newest first"
      >
        {topics.length === 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/suggest-topic')}
            style={{
              height: ROW_HEIGHT,
              justifyContent: 'center',
              paddingHorizontal: SPACE.md,
              borderRadius: RADIUS.lg,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: DARK.border,
            }}
          >
            <Text style={{ fontWeight: '700' }}>No citywide topics yet · Suggest one</Text>
          </Pressable>
        ) : null}
        {topics.map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="button"
            accessibilityLabel={`Citywide topic: ${t.title}. ${topicActivity(t)}`}
            onPress={() => router.push(`/topic/${t.id}`)}
            style={({ pressed }) => ({
              width: 190,
              height: ROW_HEIGHT,
              justifyContent: 'center',
              paddingHorizontal: SPACE.md,
              borderRadius: RADIUS.lg,
              backgroundColor: DARK.card,
              borderWidth: 1,
              borderColor: t.pinned ? DARK.accent : DARK.hairline,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700' }}>
              {t.title}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 11.5, color: DARK.textMuted }}>
              {topicActivity(t)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="See all citywide topics"
        onPress={() => router.push('/topics')}
        style={({ pressed }) => ({
          height: ROW_HEIGHT,
          minWidth: 64,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 10,
          borderRadius: RADIUS.lg,
          backgroundColor: DARK.accent,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Ionicons name="globe-outline" size={17} color={DARK.onAccent} />
        <Text style={{ color: DARK.onAccent, fontWeight: '800', fontSize: 12 }}>See all</Text>
      </Pressable>
    </View>
  );
}
