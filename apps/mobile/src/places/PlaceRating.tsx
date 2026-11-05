import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK, type PlaceSummary } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { showAlert } from '@/dialog';
import { getFreshReading } from '@/location/device';
import { haptic } from '@/motion';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';

type Rating = Pick<PlaceSummary, 'rating' | 'myRating' | 'ratingsLocked'>;

/** D201: show a sample ratio on places that don't have enough ratings yet (owner preview). */
const PREVIEW_RATIO = true;

/** D144: "88%" with a thumbs up, for the Places list (only once a place has enough votes). */
export function LikedBadge({ rating }: { rating: NonNullable<PlaceSummary['rating']> }) {
  return (
    <View
      accessible
      accessibilityLabel={`${rating.likedPercent}% liked, ${rating.votes} ratings`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        height: 26,
        borderRadius: RADIUS.pill,
        backgroundColor: DARK.accentSoft,
      }}
    >
      <Ionicons name="thumbs-up" size={13} color={DARK.tealText} />
      <Text style={{ color: DARK.text, fontSize: 14, fontWeight: '800' }}>
        {rating.likedPercent}%
      </Text>
    </View>
  );
}

/**
 * D144: rate a place, only while you're there: Liked or Not for me, tap again to take it
 * back. The % liked shows once enough people rated it. One vote per account.
 */
export function PlaceRatingCard({
  place,
  onChange,
}: {
  place: PlaceSummary;
  onChange: (r: Rating) => void;
}) {
  const [busy, setBusy] = useState<1 | -1 | null>(null);
  // D201: once you've rated, the card shrinks to your answer; "edit" reopens it for this visit only.
  const [editing, setEditing] = useState(false);
  const here = place.withinRoomRadius;
  const canRate = here && !place.ratingsLocked;

  async function rate(value: 1 | -1) {
    const next = place.myRating === value ? 0 : value; // tapping your vote again takes it back
    setBusy(value);
    try {
      const reading = await getFreshReading({ fresh: true });
      const r = await api.put<Rating>(`/api/v1/places/${place.id}/rating`, {
        reading,
        value: next,
      });
      haptic.select();
      setEditing(false);
      onChange(r);
    } catch (e) {
      showAlert(
        'Couldn’t save your rating',
        e instanceof ApiRequestError ? e.message : 'Try again.',
        undefined,
        { icon: 'thumbs-up-outline', tone: 'warning' },
      );
    } finally {
      setBusy(null);
    }
  }

  // D201 (preview): until a place has enough ratings, show a sample ratio so the owner can see
  // where it sits. Remove PREVIEW_RATIO to go back to "Not enough ratings yet".
  const summary = place.rating
    ? `${place.rating.likedPercent}% liked · ${place.rating.votes} ratings`
    : PREVIEW_RATIO
      ? '88% liked · 24 ratings (preview)'
      : 'Not enough ratings yet';
  const hint = place.ratingsLocked
    ? 'Rating is paused for this place.'
    : here
      ? place.myRating
        ? 'Thanks! Tap your choice again to take it back.'
        : 'You’re here. How is it?'
      : 'You can rate it while you’re here.';

  const button = (value: 1 | -1, label: string, icon: 'thumbs-up' | 'thumbs-down') => {
    const active = place.myRating === value;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active, disabled: !canRate, busy: busy === value }}
        disabled={!canRate || busy !== null}
        onPress={() => void rate(value)}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 44,
          borderRadius: RADIUS.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          borderWidth: 1.5,
          borderColor: active ? DARK.accent : DARK.border,
          backgroundColor: active ? DARK.accent : 'transparent',
          opacity: !canRate ? 0.45 : pressed ? 0.8 : 1,
        })}
      >
        {busy === value ? (
          <ActivityIndicator color={active ? DARK.onAccent : DARK.accent} />
        ) : (
          <>
            <Ionicons
              name={active ? icon : `${icon}-outline`}
              size={18}
              color={active ? DARK.onAccent : DARK.text}
            />
            <Text style={{ fontWeight: '800', color: active ? DARK.onAccent : DARK.text }}>
              {label}
            </Text>
          </>
        )}
      </Pressable>
    );
  };

  if (place.myRating && !editing) {
    const liked = place.myRating === 1;
    return (
      <View
        style={{
          marginHorizontal: SPACE.md,
          marginTop: SPACE.sm,
          paddingVertical: 10,
          paddingLeft: SPACE.md,
          paddingRight: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderRadius: RADIUS.lg,
          backgroundColor: DARK.card,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: liked ? DARK.accent : DARK.raised,
          }}
        >
          <Ionicons
            name={liked ? 'thumbs-up' : 'thumbs-down'}
            size={18}
            color={liked ? DARK.onAccent : DARK.text}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', fontSize: 16 }}>
            {liked ? 'Liked it' : 'Not for me'}
          </Text>
          <Text style={[TYPE.caption, { color: place.rating ? DARK.tealText : DARK.textMuted }]}>
            {summary}
          </Text>
        </View>
        {canRate ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change your rating"
            onPress={() => setEditing(true)}
            hitSlop={6}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: DARK.raised,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="pencil" size={16} color={DARK.text} />
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={{
        marginHorizontal: SPACE.md,
        marginTop: SPACE.sm,
        padding: SPACE.md,
        gap: 10,
        borderRadius: RADIUS.lg,
        backgroundColor: DARK.card,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '800', fontSize: 16 }}>Rate this place</Text>
        <Text style={[TYPE.caption, { color: place.rating ? DARK.tealText : DARK.textMuted }]}>
          {summary}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
        {button(1, 'Liked it', 'thumbs-up')}
        {button(-1, 'Not for me', 'thumbs-down')}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[TYPE.caption, { color: DARK.textMuted, flex: 1 }]}>{hint}</Text>
        {editing ? (
          <Pressable accessibilityRole="button" onPress={() => setEditing(false)} hitSlop={8}>
            <Text style={[TYPE.caption, { color: DARK.accent, fontWeight: '800' }]}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
