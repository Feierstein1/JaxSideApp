import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BRAND, COLORS, type DiscussionKind } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { vote } from './api';

/**
 * Up/down voting (P3.4). Tapping your current vote again clears it. The count shown is
 * always the server's answer (§8); the button state flips immediately for feel.
 * Upvote = teal, downvote = old gold (D33).
 */
export function VoteControl({
  target,
  score: initialScore,
  myVote: initialVote,
  compact = false,
  onError,
}: {
  target: { type: DiscussionKind | 'comment'; id: string };
  score: number;
  myVote: -1 | 0 | 1;
  compact?: boolean;
  onError?: (message: string) => void;
}) {
  const [score, setScore] = useState(initialScore);
  const [mine, setMine] = useState(initialVote);
  const [busy, setBusy] = useState(false);

  async function press(dir: 1 | -1) {
    if (busy) return;
    const next = mine === dir ? 0 : dir;
    const before = { score, mine };
    setMine(next);
    setScore(score - mine + next);
    setBusy(true);
    try {
      const r = await vote(target, next);
      setScore(r.score);
      setMine(r.myVote);
    } catch (e) {
      setScore(before.score);
      setMine(before.mine);
      onError?.(e instanceof ApiRequestError ? e.message : 'Couldn’t save your vote.');
    } finally {
      setBusy(false);
    }
  }

  const size = compact ? 18 : 22;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 2 : 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Upvote"
        accessibilityState={{ selected: mine === 1 }}
        hitSlop={8}
        onPress={() => void press(1)}
      >
        <Ionicons
          name={mine === 1 ? 'arrow-up-circle' : 'arrow-up-circle-outline'}
          size={size}
          color={mine === 1 ? COLORS.primary : COLORS.textMuted}
        />
      </Pressable>
      <Text
        accessibilityLabel={`Score ${score}`}
        style={{
          minWidth: 22,
          textAlign: 'center',
          fontWeight: '700',
          fontSize: compact ? 13 : 15,
          color: mine === 1 ? COLORS.primary : mine === -1 ? BRAND.oldGold : COLORS.text,
        }}
      >
        {score}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Downvote"
        accessibilityState={{ selected: mine === -1 }}
        hitSlop={8}
        onPress={() => void press(-1)}
      >
        <Ionicons
          name={mine === -1 ? 'arrow-down-circle' : 'arrow-down-circle-outline'}
          size={size}
          color={mine === -1 ? BRAND.oldGold : COLORS.textMuted}
        />
      </Pressable>
    </View>
  );
}
