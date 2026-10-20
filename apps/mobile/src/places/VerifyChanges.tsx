import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, View } from 'react-native';
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

/**
 * D94: "Verify changes near you": a small sideways strip at the top of Places with places
 * people asked to add or remove within 528 yd. Tap a side once; the vote is final. Ten
 * votes one way decide it. Hidden when there's nothing to verify.
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

  if (!items.length) return null;
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
        <Text style={[TYPE.caption, { color: DARK.textMuted }]}>· {items.length}</Text>
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={items}
        keyExtractor={(c) => `${c.kind}:${c.id}`}
        contentContainerStyle={{ paddingHorizontal: SPACE.md, gap: SPACE.sm }}
        renderItem={({ item }) => (
          <ChangeCard
            change={item}
            onVoted={(updated, decided) => {
              setItems((all) =>
                decided
                  ? all.filter((c) => c.id !== item.id)
                  : all.map((c) => (c.id === item.id ? updated : c)),
              );
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

function ChangeCard({
  change: c,
  onVoted,
}: {
  change: PlaceChange;
  onVoted: (updated: PlaceChange, decided: boolean) => void;
}) {
  const [busy, setBusy] = useState<boolean | null>(null);
  const add = c.kind === 'add';
  const color = categoryColor(c.category);
  const voted = c.myVote !== null;

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
      if (decided) Alert.alert('Thanks for verifying', OUTCOME[r.outcome] ?? 'Thanks!');
      onVoted(
        {
          ...c,
          myVote: support,
          yes: c.yes + (support ? 1 : 0),
          no: c.no + (support ? 0 : 1),
        },
        decided,
      );
    } catch (e) {
      Alert.alert('Couldn’t vote', e instanceof ApiRequestError ? e.message : 'Try again.');
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
        {voted || c.mine ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 }}>
            <Ionicons name="checkmark-circle" size={16} color={DARK.tealText} />
            <Text style={[TYPE.caption, { color: DARK.text }]}>
              {c.mine && !voted
                ? 'You asked for this'
                : `You voted “${c.myVote ? yesLabel : noLabel}”`}
              {' · '}
              {c.yes} {yesLabel.toLowerCase()} · {c.no} {noLabel.toLowerCase()}
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <VoteButton
              label={yesLabel}
              icon={add ? 'checkmark' : 'close-circle-outline'}
              busy={busy === true}
              disabled={busy !== null}
              onPress={() => void vote(true)}
              strong
            />
            <VoteButton
              label={noLabel}
              icon={add ? 'close' : 'storefront-outline'}
              busy={busy === false}
              disabled={busy !== null}
              onPress={() => void vote(false)}
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
