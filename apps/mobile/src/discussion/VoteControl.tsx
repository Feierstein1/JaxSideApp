import { useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK, type DiscussionKind } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useGuest } from '@/auth/guest';
import { haptic, useReducedMotion } from '@/motion';
import { Text } from '@/text';
import { vote } from './api';

/**
 * Up/down voting (P3.4). Tapping your current vote again clears it. The count shown is
 * always the server's answer (§8); the button state flips immediately for feel.
 * D79: a pill that tints when you've voted: teal for up, gold for down.
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
  const { isGuest, promptAccount } = useGuest();

  async function press(dir: 1 | -1) {
    if (isGuest) return promptAccount('vote'); // P4.2: the server refuses guest votes too
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

  const size = compact ? 19 : 21;
  const bg = compact
    ? 'transparent'
    : mine === 1
      ? DARK.tealSoft
      : mine === -1
        ? DARK.accentSoft
        : DARK.raised;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: compact ? 32 : 36,
        borderRadius: 999,
        backgroundColor: bg,
        paddingHorizontal: compact ? 0 : 2,
      }}
    >
      <VoteArrow
        dir={1}
        on={mine === 1}
        size={size}
        onPress={() => void press(1)}
        color={mine === 1 ? DARK.tealText : DARK.textMuted}
      />
      <Text
        accessibilityLabel={`Score ${score}`}
        style={{
          minWidth: 18,
          textAlign: 'center',
          fontWeight: '800',
          fontSize: compact ? 13 : 14,
          fontVariant: ['tabular-nums'],
          color: mine === 1 ? DARK.tealText : mine === -1 ? DARK.accent : DARK.text,
        }}
      >
        {score}
      </Text>
      <VoteArrow
        dir={-1}
        on={mine === -1}
        size={size}
        onPress={() => void press(-1)}
        color={mine === -1 ? DARK.accent : DARK.textMuted}
      />
    </View>
  );
}

/** D78: one vote arrow; it pops a little and taps the phone when chosen. */
function VoteArrow({
  dir,
  on,
  size,
  color,
  onPress,
}: {
  dir: 1 | -1;
  on: boolean;
  size: number;
  color: string;
  onPress: () => void;
}) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  function tap() {
    haptic.tap();
    if (!reduced && !on) {
      scale.setValue(0.7);
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 14,
      }).start();
    }
    onPress();
  }
  const name =
    dir === 1
      ? on
        ? 'arrow-up-circle'
        : 'arrow-up-circle-outline'
      : on
        ? 'arrow-down-circle'
        : 'arrow-down-circle-outline';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dir === 1 ? 'Upvote' : 'Downvote'}
      accessibilityState={{ selected: on }}
      hitSlop={6}
      onPress={tap}
      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name={name} size={size} color={color} />
      </Animated.View>
    </Pressable>
  );
}
