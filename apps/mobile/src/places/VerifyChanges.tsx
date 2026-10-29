import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { categoryColor, DARK, type PlaceChange } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { categoryLabel, formatDistance } from '@/format';
import { getFreshReading } from '@/location/device';
import { haptic } from '@/motion';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { categoryIcon } from './PlaceHeader';
import { showAlert } from '@/dialog';
import { ensureGuide } from '@/guides/guide';
import { dismiss, isDismissed, useDismissed } from '@/dismissed';

/**
 * D94: "Verify changes near you": a small sideways strip at the top of Places with places
 * people asked to add or remove within 528 yd. Tap a side, then you have a few seconds to
 * undo before it's sent; after that it's final (D100). Once you vote, the card leaves your
 * strip; your own requests never appear (they already count as your vote). Ten votes one
 * way decide it. Hidden when there's nothing left to verify. D162: × hides the strip until a
 * new change shows up nearby.
 */
export function VerifyChanges({
  reloadKey,
  onDecided,
}: {
  reloadKey: string;
  /** Called when a vote decides a change (e.g. reload the Places list). */
  onDecided?: () => void;
}) {
  const [items, setItems] = useState<PlaceChange[]>([]);

  const load = useCallback(async () => {
    try {
      const reading = await getFreshReading();
      const r = await api.post<{ changes: PlaceChange[] }>('/api/v1/places/changes', { reading });
      setItems(r.changes);
    } catch {
      setItems([]); // the strip is extra; the list shows any location problem
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  useDismissed();
  const key = (c: PlaceChange) => `place-change:${c.kind}:${c.id}`;
  const shown = items.filter((c) => !isDismissed(key(c)));

  if (!shown.length) return null;
  return (
    <View style={{ paddingTop: SPACE.sm, paddingBottom: SPACE.xs }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: SPACE.md,
          marginBottom: 6,
        }}
      >
        <Ionicons name="checkmark-done" size={16} color={DARK.accent} />
        <Text style={{ fontWeight: '800', fontSize: 15 }}>Verify changes near you</Text>
        <Text style={[TYPE.caption, { color: DARK.textMuted, flex: 1 }]}>· {shown.length}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hide changes to verify"
          onPress={() => dismiss(shown.map(key))}
          hitSlop={10}
        >
          <Ionicons name="close" size={20} color={DARK.textMuted} />
        </Pressable>
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={shown}
        keyExtractor={(c) => `${c.kind}:${c.id}`}
        contentContainerStyle={{ paddingHorizontal: SPACE.md, gap: SPACE.sm }}
        renderItem={({ item }) => (
          <ChangeCard
            change={item}
            onVoted={(decided) => {
              // D100: voted cards leave the strip (it hides when nothing's left).
              setItems((all) => all.filter((c) => c.id !== item.id));
              if (decided) onDecided?.();
            }}
          />
        )}
      />
    </View>
  );
}

const OUTCOME: Record<string, string> = {
  added: 'That did it: the place is now in Places.',
  dropped: 'That did it: the suggestion was dropped.',
  removed: 'That did it: the place was taken off Places.',
  kept: 'That did it: the place stays listed.',
};

/** D100: seconds to change your mind before a vote is sent (then it's final). */
const UNDO_SECONDS = 5;

function ChangeCard({
  change: c,
  onVoted,
}: {
  change: PlaceChange;
  onVoted: (decided: boolean) => void;
}) {
  const [busy, setBusy] = useState<boolean | null>(null);
  const [pending, setPending] = useState<{ support: boolean; left: number } | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const add = c.kind === 'add';
  /** D104: the first vote of each kind shows its guide. */
  async function pick(support: boolean) {
    if (!(await ensureGuide(add ? 'placeSuggestion' : 'placeRemoval'))) return;
    setPending({ support, left: UNDO_SECONDS });
  }

  const color = categoryColor(c.category);

  // Count down; send when it reaches zero.
  useEffect(() => {
    if (!pending) return;
    if (pending.left <= 0) {
      setPending(null);
      void vote(pending.support);
      return;
    }
    const t = setTimeout(() => setPending({ ...pending, left: pending.left - 1 }), 1000);
    return () => clearTimeout(t);
  }, [pending]);
  // Leaving the screen mid-countdown still sends the vote you picked.
  useEffect(() => () => void (pendingRef.current && vote(pendingRef.current.support)), []);

  async function vote(support: boolean) {
    setBusy(support);
    try {
      const reading = await getFreshReading({ fresh: true });
      const r = await api.post<{ outcome: string }>('/api/v1/places/changes/vote', {
        reading,
        kind: c.kind,
        id: c.id,
        support,
      });
      haptic.success();
      const decided = r.outcome !== 'open';
      if (decided)
        showAlert('Thanks for verifying', OUTCOME[r.outcome] ?? 'Thanks!', undefined, {
          icon: 'checkmark-done-circle',
          tone: 'success',
        });
      onVoted(decided);
    } catch (e) {
      showAlert(
        'Couldn’t vote',
        e instanceof ApiRequestError ? e.message : 'Try again.',
        undefined,
        { icon: 'cloud-offline-outline', tone: 'danger' },
      );
    } finally {
      setBusy(null);
    }
  }

  const yesLabel = add ? 'It’s here' : 'Closed';
  const noLabel = add ? 'Not here' : 'Still open';
  return (
    <View
      style={{
        width: 236,
        borderRadius: RADIUS.lg,
        backgroundColor: DARK.card,
        overflow: 'hidden',
      }}
    >
      <View style={{ height: 4, backgroundColor: add ? DARK.tealText : DARK.accent }} />
      <View style={{ padding: SPACE.md, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              backgroundColor: color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={categoryIcon(c.category)} size={16} color={DARK.onTeal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 11.5,
                fontWeight: '800',
                color: add ? DARK.tealText : DARK.accent,
                textTransform: 'uppercase',
              }}
            >
              {add ? 'New place?' : 'Closed?'}
            </Text>
            <Text numberOfLines={1} style={{ fontWeight: '800', fontSize: 15 }}>
              {c.name}
            </Text>
          </View>
        </View>
        <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
          {categoryLabel(c.category)} · {formatDistance(c.distanceMeters)} · {Math.max(c.yes, c.no)}
          /{c.needed} votes
        </Text>
        {pending ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 }}>
            <Text style={[TYPE.caption, { color: DARK.text, flex: 1 }]}>
              You picked “{pending.support ? yesLabel : noLabel}” · sending in {pending.left}s
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Undo vote"
              onPress={() => setPending(null)}
              style={{
                minHeight: 36,
                paddingHorizontal: 12,
                borderRadius: RADIUS.pill,
                justifyContent: 'center',
                backgroundColor: DARK.raised,
              }}
            >
              <Text style={{ fontWeight: '800', fontSize: 13, color: DARK.accent }}>Undo</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <VoteButton
              label={yesLabel}
              icon={add ? 'checkmark' : 'close-circle-outline'}
              busy={busy === true}
              disabled={busy !== null}
              onPress={() => void pick(true)}
              strong
            />
            <VoteButton
              label={noLabel}
              icon={add ? 'close' : 'storefront-outline'}
              busy={busy === false}
              disabled={busy !== null}
              onPress={() => void pick(false)}
            />
          </View>
        )}
      </View>
    </View>
  );
}

function VoteButton({
  label,
  icon,
  busy,
  disabled,
  onPress,
  strong = false,
}: {
  label: string;
  icon: 'checkmark' | 'close' | 'close-circle-outline' | 'storefront-outline';
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
  strong?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 36,
        borderRadius: RADIUS.pill,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        backgroundColor: strong ? DARK.accent : DARK.raised,
        opacity: pressed || (disabled && !busy) ? 0.6 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator size="small" color={strong ? DARK.onAccent : DARK.text} />
      ) : (
        <>
          <Ionicons name={icon} size={15} color={strong ? DARK.onAccent : DARK.text} />
          <Text
            style={{ fontWeight: '800', fontSize: 13, color: strong ? DARK.onAccent : DARK.text }}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
