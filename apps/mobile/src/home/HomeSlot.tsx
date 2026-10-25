import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { DARK, type PollView, type TopicView } from '@jax/shared';
import { fetchPolls, pollWhen } from '@/polls/api';
import { hasVoted, takeThanks, useVotedVersion } from '@/polls/voted';
import { Text } from '@/text';
import { fetchTopics, topicActivity } from '@/topics/api';
import { DecoBox } from '@/deco';
import { SPACE } from '@/tokens';

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
  const [thanks, setThanks] = useState(false);
  useVotedVersion(); // D130: hide a poll the moment you vote in it

  useFocusEffect(
    useCallback(() => {
      let live = true;
      // D130: just voted? A short thank-you in the poll's place, then Citywide.
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (takeThanks()) {
        setThanks(true);
        timer = setTimeout(() => setThanks(false), 3000);
      }
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
        if (timer) clearTimeout(timer);
      };
    }, [reloadKey]),
  );

  if (thanks) return <ThanksBar />;
  if (poll && !hasVoted(poll.id)) return <PollPrompt poll={poll} />;
  if (topics) return <CitywideRow topics={topics} />;
  return null;
}

/** D130: right after voting, in the poll's place for a few seconds. */
function ThanksBar() {
  return (
    <DecoBox
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel="Thanks for voting. Results show when the poll closes."
      shape="chamfer"
      fill={DARK.tealSoft}
      stroke={DARK.accent}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.sm,
        height: 48,
        paddingHorizontal: SPACE.md,
      }}
    >
      <Ionicons name="checkmark-circle" size={22} color={DARK.accent} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontWeight: '800' }}>Thanks for voting!</Text>
        <Text style={{ fontSize: 12, color: DARK.textMuted }}>
          Results show when the poll closes.
        </Text>
      </View>
    </DecoBox>
  );
}

/** The poll in the shared space: one line of question, and a Vote button. */
function PollPrompt({ poll }: { poll: PollView }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Poll of the week: ${poll.question}. Tap to vote. ${pollWhen(poll)}`}
      onPress={() => router.push(`/poll/${poll.id}`)}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      {/* D127: clipped corners, the accent outline, an arrow-ended Vote button. */}
      <DecoBox
        shape="chamfer"
        fill={DARK.card}
        stroke={DARK.accent}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
          height: 48,
          paddingHorizontal: SPACE.md,
        }}
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
        <DecoBox
          shape="arrow"
          cut={8}
          fill={DARK.accent}
          style={{ paddingHorizontal: 15, paddingVertical: 6 }}
        >
          <Text style={{ color: DARK.onAccent, fontWeight: '800', fontSize: 13 }}>Vote</Text>
        </DecoBox>
      </DecoBox>
    </Pressable>
  );
}

const ROW_HEIGHT = 42;

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
          <Pressable accessibilityRole="button" onPress={() => router.push('/citywide/suggest')}>
            <DecoBox
              shape="chamfer"
              fill="transparent"
              stroke={DARK.border}
              style={{ height: ROW_HEIGHT, justifyContent: 'center', paddingHorizontal: SPACE.md }}
            >
              <Text style={{ fontWeight: '700' }}>No citywide topics yet · Suggest one</Text>
            </DecoBox>
          </Pressable>
        ) : null}
        {topics.map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="button"
            accessibilityLabel={`Citywide topic: ${t.title}. ${topicActivity(t)}`}
            onPress={() => router.push(`/citywide/topic/${t.id}`)}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <DecoBox
              shape="chamfer"
              cut={8}
              fill={DARK.card}
              stroke={t.pinned ? DARK.accent : DARK.hairline}
              style={{
                width: 190,
                height: ROW_HEIGHT,
                justifyContent: 'center',
                paddingHorizontal: SPACE.md,
              }}
            >
              <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700' }}>
                {t.title}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 11.5, color: DARK.textMuted }}>
                {topicActivity(t)}
              </Text>
            </DecoBox>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="See all citywide topics"
        onPress={() => router.navigate('/citywide')}
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      >
        <DecoBox
          shape="chamfer"
          cut={8}
          fill={DARK.accent}
          style={{
            height: ROW_HEIGHT,
            minWidth: 64,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 10,
          }}
        >
          <Ionicons name="globe-outline" size={17} color={DARK.onAccent} />
          <Text style={{ color: DARK.onAccent, fontWeight: '800', fontSize: 12 }}>See all</Text>
        </DecoBox>
      </Pressable>
    </View>
  );
}
