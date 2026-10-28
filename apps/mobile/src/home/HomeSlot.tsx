import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { DARK, type PollView } from '@jax/shared';
import { fetchPolls, pollWhen } from '@/polls/api';
import { hasVoted, takeThanks, useVotedVersion } from '@/polls/voted';
import { Text } from '@/text';
import { DecoBox } from '@/deco';
import { SPACE } from '@/tokens';

/**
 * D126 / D133: the poll's space on Home, between search and the type tabs. While there's an
 * open poll you can vote in, it shows the poll; right after you vote, a short thank-you; then
 * nothing, so the posts get the room. City Topics live in the Topics tab.
 */
export function HomeSlot({ reloadKey }: { reloadKey: string }) {
  const [poll, setPoll] = useState<PollView | null>(null);
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
      void fetchPolls()
        .catch(() => null)
        .then((polls) => {
          // D150: the admin's Poll of the week first; otherwise the newest you can vote in.
          if (live) {
            const open = polls?.open ?? [];
            setPoll(
              open.find((p) => p.featured && p.canVote) ?? open.find((p) => p.canVote) ?? null,
            );
          }
        });
      return () => {
        live = false;
        if (timer) clearTimeout(timer);
      };
    }, [reloadKey]),
  );

  if (thanks) return <ThanksBar />;
  if (poll && !hasVoted(poll.id)) return <PollPrompt poll={poll} />;
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
