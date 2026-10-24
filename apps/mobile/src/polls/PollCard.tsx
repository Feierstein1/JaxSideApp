import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { DARK, type PollView } from '@jax/shared';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { fetchPolls, pollWhen } from './api';

const WEEK = 7 * 86_400_000;

/** The poll to feature: an open one, else one that closed in the last week. */
function featured(open: PollView[], closed: PollView[], now = Date.now()) {
  const unvoted = open.find((p) => !p.myChoiceId);
  if (unvoted ?? open[0]) return unvoted ?? open[0]!;
  return closed.find((p) => now - Date.parse(p.closesAt) < WEEK) ?? null;
}

/**
 * D123: "Poll of the week" at the top of Home: tap to vote, or see the results for a week
 * after it closes. Hidden when there's nothing to show or polls can't load.
 */
export function PollCard({ reloadKey }: { reloadKey: string }) {
  const [poll, setPoll] = useState<PollView | null>(null);
  useEffect(() => {
    let live = true;
    fetchPolls()
      .then((r) => live && setPoll(featured(r.open, r.closed)))
      .catch(() => live && setPoll(null));
    return () => {
      live = false;
    };
  }, [reloadKey]);
  if (!poll) return null;

  const closed = poll.status === 'closed';
  const voted = !!poll.myChoiceId;
  const leader =
    closed && poll.results?.voters
      ? [...poll.results.counts].sort((a, b) => b.count - a.count)[0]
      : undefined;
  const leaderLabel = poll.choices.find((c) => c.id === leader?.choiceId)?.label;
  const status = closed
    ? leaderLabel && leader && poll.results
      ? `Top answer: ${leaderLabel} (${Math.round((leader.count / poll.results.voters) * 100)}%)`
      : 'See the results'
    : voted
      ? `You voted · results when it closes`
      : `Tap to vote · ${pollWhen(poll)}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${closed ? 'Poll results' : 'Poll of the week'}: ${poll.question}. ${status}`}
      onPress={() => router.push(`/poll/${poll.id}`)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
        padding: SPACE.md,
        borderRadius: RADIUS.lg,
        backgroundColor: DARK.card,
        borderWidth: 1,
        borderColor: voted || closed ? DARK.hairline : DARK.accent,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: DARK.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name={closed ? 'stats-chart' : 'checkbox-outline'}
          size={21}
          color={DARK.accent}
        />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[TYPE.caption, { color: DARK.accent, fontWeight: '800', letterSpacing: 0.6 }]}>
          {closed ? 'RESULTS ARE IN' : 'POLL OF THE WEEK'}
        </Text>
        <Text style={{ fontSize: 15.5, fontWeight: '700' }} numberOfLines={2}>
          {poll.question}
        </Text>
        <Text style={[TYPE.caption, { color: DARK.textMuted }]}>{status}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={DARK.textMuted} />
    </Pressable>
  );
}
