import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK, type AdCard as Ad } from '@jax/shared';
import { useGuest } from '@/auth/guest';
import { photoUri } from '@/discussion/photos';
import { haptic } from '@/motion';
import { Text } from '@/text';
import { RADIUS, SPACE } from '@/tokens';
import { setAdInterest } from './api';

type Choice = 'INTERESTED' | 'NOT_INTERESTED' | null;

/**
 * D206 / B3.6: an ad between posts. Always labelled "Sponsored" with the place's name, so it
 * can't pass for a post. The template sets the picture: a small one beside the text (banner),
 * one under the text (post-style), or a large one on top (feature). Signed-in people can mark
 * it Interested (more from that business) or Not interested (hides the business's ads for a
 * while); either folds the card into a one-line note with Undo. Guests just see it.
 */
export function AdCard({ ad }: { ad: Ad }) {
  const { isGuest } = useGuest();
  const [choice, setChoice] = useState<Choice>(ad.myChoice);
  const [busy, setBusy] = useState(false);

  async function choose(next: Choice) {
    if (busy) return;
    const before = choice;
    setChoice(next); // feels instant; put back if the server says no
    setBusy(true);
    haptic.select();
    try {
      await setAdInterest(ad.id, next);
    } catch {
      setChoice(before);
    } finally {
      setBusy(false);
    }
  }

  // Either answer folds the card away (with Undo), so neither button is the "make it
  // go away" one: people pick what they mean, not what clears the screen.
  if (choice) {
    const interested = choice === 'INTERESTED';
    return (
      <View
        style={{
          marginHorizontal: SPACE.md,
          marginVertical: 6,
          padding: SPACE.md,
          borderRadius: RADIUS.md,
          backgroundColor: DARK.card,
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
        }}
      >
        <Ionicons
          name={interested ? 'thumbs-up' : 'eye-off-outline'}
          size={18}
          color={interested ? DARK.accent : DARK.textMuted}
        />
        <Text style={{ flex: 1, color: DARK.textMuted }}>
          {interested
            ? `Got it. You’ll see more from ${ad.place.name}.`
            : `Hidden. You won’t see ads from ${ad.place.name} for a while.`}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void choose(null)}
          hitSlop={8}
          disabled={busy}
        >
          <Text style={{ color: DARK.accent, fontWeight: '700' }}>Undo</Text>
        </Pressable>
      </View>
    );
  }

  const image = ad.imageUrl ? { uri: photoUri(ad.imageUrl) } : null;
  const banner = ad.template === 'BANNER';
  return (
    <View
      accessibilityLabel={`Sponsored by ${ad.place.name}: ${ad.headline}`}
      style={{
        marginHorizontal: SPACE.md,
        marginVertical: 6,
        borderRadius: RADIUS.md,
        backgroundColor: DARK.card,
        borderWidth: 1,
        borderColor: DARK.hairline,
        overflow: 'hidden',
      }}
    >
      {image && ad.template === 'FEATURE' ? (
        <Image
          source={image}
          style={{ width: '100%', aspectRatio: 16 / 9 }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <View style={{ padding: SPACE.md, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: DARK.textMuted, fontSize: 12, fontWeight: '700' }}>Sponsored</Text>
          <Text style={{ color: DARK.textMuted, fontSize: 12 }}>·</Text>
          <Text
            numberOfLines={1}
            style={{ flexShrink: 1, color: DARK.text, fontSize: 12, fontWeight: '700' }}
          >
            {ad.place.name}
          </Text>
          {ad.adultsOnly ? (
            <View
              style={{
                paddingHorizontal: 6,
                borderRadius: RADIUS.pill,
                backgroundColor: DARK.raised,
              }}
            >
              <Text style={{ color: DARK.text, fontSize: 11, fontWeight: '800' }}>21+</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: SPACE.md }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', letterSpacing: -0.2 }}>
              {ad.headline}
            </Text>
            {ad.body ? <Text style={{ color: DARK.text }}>{ad.body}</Text> : null}
          </View>
          {image && banner ? (
            <Image
              source={image}
              style={{ width: 72, height: 72, borderRadius: RADIUS.sm }}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : null}
        </View>
        {image && ad.template === 'POST' ? (
          <Image
            source={image}
            style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: RADIUS.sm }}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}
        {isGuest ? null : (
          <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: 4 }}>
            <InterestButton
              label="Interested"
              icon="thumbs-up-outline"
              active={false}
              disabled={busy}
              onPress={() => void choose('INTERESTED')}
            />
            <InterestButton
              label="Not interested"
              icon="eye-off-outline"
              active={false}
              disabled={busy}
              onPress={() => void choose('NOT_INTERESTED')}
            />
          </View>
        )}
      </View>
    </View>
  );
}

function InterestButton({
  label,
  icon,
  active,
  disabled,
  onPress,
}: {
  label: string;
  icon: 'thumbs-up-outline' | 'eye-off-outline';
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        height: 32,
        borderRadius: RADIUS.pill,
        backgroundColor: active ? DARK.accent : DARK.raised,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name={icon} size={15} color={active ? DARK.onAccent : DARK.text} />
      <Text style={{ color: active ? DARK.onAccent : DARK.text, fontSize: 13, fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}
