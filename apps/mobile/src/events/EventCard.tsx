import { Image, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import {
  DARK,
  dateLabel,
  EVENT_CATEGORIES,
  EVENT_SETTINGS,
  timeLabel,
  type EventCard as EventCardView,
} from '@jax/shared';
import { DecoBox } from '@/deco';
import { photoUri } from '@/discussion/photos';
import { categoryIcon } from '@/places/PlaceHeader';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';

/** "7:00 PM – 10:00 PM". */
export const timeRange = (e: { startTime: string; endTime: string }) =>
  `${timeLabel(e.startTime)} – ${timeLabel(e.endTime)}`;

/** A small label on a card: Free / $10, Indoor, 21+, Happening now, Cancelled. */
export function Tag({
  text,
  tone = 'muted',
}: {
  text: string;
  tone?: 'muted' | 'accent' | 'alert';
}) {
  const bg = tone === 'accent' ? DARK.accent : tone === 'alert' ? DARK.errorSoft : DARK.raised;
  const fg = tone === 'accent' ? DARK.onAccent : tone === 'alert' ? DARK.error : DARK.text;
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: RADIUS.sm,
        paddingHorizontal: 7,
        paddingVertical: 2,
      }}
    >
      <Text style={{ fontSize: 11.5, fontWeight: '800', color: fg }}>{text}</Text>
    </View>
  );
}

/** The business that puts it on: its place's icon and name. */
export function HostLine({ e }: { e: EventCardView }) {
  if (e.host.kind !== 'business' || !e.host.name) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: DARK.teal,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={categoryIcon(e.host.placeCategory ?? '')} size={11} color={DARK.onTeal} />
      </View>
      <Text
        style={[TYPE.caption, { color: DARK.text, fontWeight: '700', flexShrink: 1 }]}
        numberOfLines={1}
      >
        {e.host.name}
      </Text>
    </View>
  );
}

/**
 * D230: one event session in a list: picture, category, title, when and where, the business
 * (name and icon) for business events, and tags. Tapping it opens the event.
 */
export function EventCard({ e, showDate = false }: { e: EventCardView; showDate?: boolean }) {
  const when = `${showDate ? `${dateLabel(e.date)} · ` : ''}${timeRange(e)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${e.title}. ${EVENT_CATEGORIES[e.category]}. ${when}${e.venue ? `, ${e.venue}` : ''}${e.cancelled ? '. Cancelled' : ''}${e.happeningNow ? '. Happening now' : ''}`}
      onPress={() => router.push(`/events/event/${e.id}`)}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <DecoBox
        shape="chamfer"
        fill={DARK.card}
        stroke={e.happeningNow ? DARK.accent : undefined}
        style={{ padding: SPACE.md, flexDirection: 'row', gap: SPACE.md }}
      >
        {e.imageUrl ? (
          <Image
            source={{ uri: photoUri(e.imageUrl) }}
            style={{ width: 72, height: 72, borderRadius: RADIUS.md, backgroundColor: DARK.raised }}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: RADIUS.md,
              backgroundColor: DARK.raised,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="calendar" size={26} color={DARK.accent} />
          </View>
        )}
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[TYPE.caption, { color: DARK.accent, fontWeight: '700' }]}>
            {EVENT_CATEGORIES[e.category]}
            {e.dayCount > 1 ? ` · Day ${e.dayNumber} of ${e.dayCount}` : ''}
          </Text>
          <Text
            style={{
              fontSize: 16,
              fontWeight: '800',
              textDecorationLine: e.cancelled ? 'line-through' : 'none',
            }}
            numberOfLines={2}
          >
            {e.title}
          </Text>
          <Text style={[TYPE.caption, { color: DARK.textMuted }]}>{when}</Text>
          {e.venue ? (
            <Text style={[TYPE.caption, { color: DARK.textMuted }]} numberOfLines={1}>
              {e.venue}
            </Text>
          ) : null}
          <HostLine e={e} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 3 }}>
            {e.cancelled ? <Tag text="Cancelled" tone="alert" /> : null}
            {e.happeningNow ? <Tag text="Happening now" tone="accent" /> : null}
            <Tag text={e.free ? 'Free' : (e.priceText ?? 'Paid')} />
            <Tag text={EVENT_SETTINGS[e.setting]} />
            {e.adultsOnly ? <Tag text="21+" /> : null}
            {e.following ? <Tag text="Following" /> : null}
          </View>
        </View>
      </DecoBox>
    </Pressable>
  );
}
