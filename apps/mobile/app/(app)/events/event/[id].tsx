import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  DARK,
  dateLabel,
  EVENT_CATEGORIES,
  EVENT_SETTINGS,
  type EventDetail,
  type ReportTarget,
} from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useGuest } from '@/auth/guest';
import { DecoBox } from '@/deco';
import { showAlert } from '@/dialog';
import { photoUri } from '@/discussion/photos';
import { eventLinkTapped, fetchEvent, setEventFollow } from '@/events/api';
import { HostedAt, HostLine, Tag, timeRange } from '@/events/EventCard';
import { EventChatEntry } from '@/events/EventChatEntry';
import { openOutsideLink } from '@/links';
import { haptic } from '@/motion';
import { ReportSheet } from '@/report/ReportSheet';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { Button, ErrorState } from '@/ui';

/**
 * D230: an event's page: pictures, what and when, where, who puts it on, the description,
 * every date still to come, Follow (reminders in the bell), Report, and, while it's on and
 * you're there, its chat. D236: the host's link (tickets, info) and "Confirmed by [place]".
 * D242: flyers shown whole above the photos.
 */
export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [e, setE] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ReportTarget>();
  const { isGuest, promptAccount } = useGuest();
  const { width } = useWindowDimensions();

  const load = useCallback(async () => {
    setError(null);
    try {
      setE(await fetchEvent(id));
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.status === 404
          ? 'This event isn’t on the calendar any more.'
          : err instanceof ApiRequestError
            ? err.message
            : 'Couldn’t load this event.',
      );
    }
  }, [id]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function toggleFollow() {
    if (!e) return;
    if (isGuest) return promptAccount('follow events');
    const next = !e.following;
    setBusy(true);
    setE({ ...e, following: next });
    try {
      const r = await setEventFollow(e.id, next);
      setE((cur) =>
        cur ? { ...cur, following: r.following, followerCount: r.followerCount } : cur,
      );
      haptic.select();
    } catch (err) {
      setE(e);
      showAlert('Couldn’t update', err instanceof ApiRequestError ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!e) {
    return (
      <View style={{ flex: 1, backgroundColor: DARK.page, justifyContent: 'center' }}>
        <ActivityIndicator color={DARK.accent} />
      </View>
    );
  }
  const imgW = width - 24;
  // D242: flyers are shown whole (never cropped), above the photo gallery.
  const flyers = e.images.filter((i) => i.kind === 'flyer');
  const photos = e.images.filter((i) => i.kind !== 'flyer');
  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: DARK.page }}
        contentContainerStyle={{ padding: 12, paddingBottom: 48, gap: SPACE.md }}
      >
        {flyers.map((img, i) => (
          <Image
            key={img.id}
            source={{ uri: photoUri(img.url) }}
            accessibilityLabel={flyers.length > 1 ? `Flyer ${i + 1} of ${flyers.length}` : 'Flyer'}
            style={{
              width: imgW,
              aspectRatio: img.width / img.height,
              borderRadius: RADIUS.lg,
              backgroundColor: DARK.raised,
            }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        ))}
        {photos.length ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {photos.map((img, i) => (
              <Image
                key={img.id}
                source={{ uri: photoUri(img.url) }}
                accessibilityLabel={`Photo ${i + 1} of ${photos.length}`}
                style={{
                  width: imgW,
                  height: Math.min(imgW * (img.height / img.width), imgW * 1.1),
                  borderRadius: RADIUS.lg,
                  backgroundColor: DARK.raised,
                  marginRight: i < photos.length - 1 ? SPACE.sm : 0,
                }}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            ))}
          </ScrollView>
        ) : null}

        <View style={{ gap: 6 }}>
          <Text style={[TYPE.caption, { color: DARK.accent, fontWeight: '700' }]}>
            {EVENT_CATEGORIES[e.category]}
          </Text>
          <Text
            accessibilityRole="header"
            style={[TYPE.title, { textDecorationLine: e.cancelled ? 'line-through' : 'none' }]}
          >
            {e.title}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {e.cancelled ? <Tag text="Cancelled" tone="alert" /> : null}
            {e.happeningNow ? <Tag text="Happening now" tone="accent" /> : null}
            <Tag text={e.free ? 'Free' : (e.priceText ?? 'Paid')} />
            <Tag text={EVENT_SETTINGS[e.setting]} />
            {e.adultsOnly ? <Tag text="21+" /> : null}
            {e.familyFriendly ? <Tag text="Family-friendly" /> : null}
          </View>
        </View>

        {e.cancelled ? null : (
          <View style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'center' }}>
            <Button
              title={e.following ? 'Following' : 'Follow'}
              icon={e.following ? 'checkmark' : 'add'}
              variant={e.following ? 'secondary' : 'primary'}
              busy={busy}
              onPress={() => void toggleFollow()}
              style={{ flex: 1, marginTop: 0 }}
            />
            {e.followerCount !== null ? (
              <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
                {e.followerCount} following
              </Text>
            ) : null}
          </View>
        )}

        {e.link && !e.cancelled ? (
          <Button
            variant="secondary"
            icon="open-outline"
            title={e.link.label}
            onPress={() => openOutsideLink(e.link!.url, () => void eventLinkTapped(e.id))}
            style={{ marginTop: 0 }}
          />
        ) : null}

        {e.hostedAt ? (
          <HostedAt
            place={e.hostedAt}
            onPress={() => router.push(`/places/${e.hostedAt!.placeId}`)}
          />
        ) : null}

        <EventChatEntry event={e} />

        <DecoBox shape="chamfer" fill={DARK.card} style={{ padding: SPACE.md, gap: SPACE.sm }}>
          <Row icon="time-outline" text={`${dateLabel(e.date)} · ${timeRange(e)}`} />
          {e.venue || e.address ? (
            <Row
              icon="location-outline"
              text={[e.venue, e.address && e.address !== e.venue ? e.address : null]
                .filter(Boolean)
                .join('\n')}
            />
          ) : null}
          {e.venueConfirmedBy && !e.hostedAt ? (
            <Row icon="checkmark-circle-outline" text={`Confirmed by ${e.venueConfirmedBy}`} />
          ) : null}
          {e.neighborhood ? (
            <Row
              icon="navigate-outline"
              text={`${e.neighborhood}${e.zip ? ` · ${e.zip}` : ''} · ${e.distanceMiles} mi away`}
            />
          ) : null}
          {e.host.kind === 'business' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${e.host.name ?? 'the business'}`}
              onPress={() => e.host.placeId && router.push(`/places/${e.host.placeId}`)}
            >
              <HostLine e={e} />
            </Pressable>
          ) : e.host.kind === 'organizer' ? (
            <HostLine e={e} />
          ) : null}
        </DecoBox>

        <Text style={TYPE.body}>{e.description}</Text>

        {e.sessions.length > 1 ? (
          <View style={{ gap: SPACE.xs }}>
            <Text accessibilityRole="header" style={[TYPE.label, { color: DARK.textMuted }]}>
              All dates
            </Text>
            {e.sessions.map((s) => (
              <Text key={s.id} style={TYPE.callout}>
                {dateLabel(s.date)} · {timeRange(s)}
              </Text>
            ))}
          </View>
        ) : null}

        {isGuest ? null : (
          <Button
            variant="link"
            icon="flag-outline"
            title="Report this event"
            onPress={() => setReport({ type: 'event', id: e.id })}
          />
        )}
      </ScrollView>
      <ReportSheet target={report} onClose={() => setReport(undefined)} />
    </>
  );
}

function Row({
  icon,
  text,
}: {
  icon: 'time-outline' | 'location-outline' | 'navigate-outline' | 'checkmark-circle-outline';
  text: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={18} color={DARK.accent} style={{ marginTop: 2 }} />
      <Text style={[TYPE.callout, { flex: 1 }]}>{text}</Text>
    </View>
  );
}
