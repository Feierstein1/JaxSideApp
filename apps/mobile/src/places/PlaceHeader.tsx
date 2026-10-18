import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BRAND, CATEGORY_GROUPS, categoryColor, COLORS, type PlaceSummary } from '@jax/shared';
import { categoryLabel, formatDistance, plural } from '@/format';
import { haptic } from '@/motion';
import { elevation, RADIUS, SPACE } from '@/tokens';
import { Bone, Pulse, type IconName } from '@/ui';

/** D78: an icon per category group, shown in the category pill and on favorites. */
const GROUP_ICONS: Record<string, IconName> = {
  food: 'restaurant',
  coffee: 'cafe',
  bars: 'beer',
  outdoors: 'leaf',
  shopping: 'bag-handle',
  fun: 'ticket',
  services: 'car',
  lodging: 'bed',
};

export function categoryIcon(category: string): IconName {
  const group = CATEGORY_GROUPS.find((g) => (g.categories as readonly string[]).includes(category));
  return GROUP_ICONS[group?.key ?? ''] ?? 'location';
}

/**
 * A place's header (D69, D70, D78), the same in the list and on the place page: the
 * category's color, a white category pill with its icon, the name (shrinks if long) and a
 * star: white outline when not a favorite, gold when it is. On the place page the star is
 * a round button (`favorite`).
 */
export function PlaceTop({
  place,
  favorite,
  large = false,
}: {
  place: PlaceSummary;
  favorite?: { onPress: () => void; busy: boolean };
  large?: boolean;
}) {
  const long = place.name.length > 20;
  const star = (
    <Ionicons
      name={place.isFavorite ? 'star' : 'star-outline'}
      size={large ? 22 : 18}
      color={place.isFavorite ? BRAND.gold : COLORS.onSurfaceInverse}
    />
  );
  return (
    <View
      style={{
        backgroundColor: categoryColor(place.category),
        paddingHorizontal: 14,
        paddingVertical: large ? 16 : 12,
        gap: large ? 10 : 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            backgroundColor: COLORS.background,
            borderRadius: RADIUS.pill,
            paddingHorizontal: 10,
            paddingVertical: 4,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Ionicons
            name={categoryIcon(place.category)}
            size={13}
            color={categoryColor(place.category)}
          />
          <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: '800' }}>
            {categoryLabel(place.category)}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        {favorite ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={place.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            accessibilityState={{ selected: place.isFavorite, busy: favorite.busy }}
            onPress={() => {
              haptic.tap();
              favorite.onPress();
            }}
            disabled={favorite.busy}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              // Gold star on black (9.2:1, D33).
              backgroundColor: COLORS.surfaceInverse,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            {favorite.busy ? <ActivityIndicator color={COLORS.onSurfaceInverse} /> : star}
          </Pressable>
        ) : place.isFavorite ? (
          <View accessibilityLabel="Favorite">{star}</View>
        ) : null}
      </View>
      <Text
        numberOfLines={large ? 2 : 1}
        adjustsFontSizeToFit={!large}
        minimumFontScale={0.7}
        style={{
          color: COLORS.onSurfaceInverse,
          fontWeight: '800',
          fontSize: (large ? 26 : 19) - (long ? 2 : 0),
          letterSpacing: -0.3,
        }}
      >
        {place.name}
      </Text>
    </View>
  );
}

function Stat({ icon, text, color }: { icon: IconName; text: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Ionicons name={icon} size={16} color={color ?? COLORS.textMuted} />
      <Text style={{ color: color ?? COLORS.text, fontWeight: '700', fontSize: 14 }}>{text}</Text>
    </View>
  );
}

/** Distance, favorites and posts with icons (white row under the header). */
export function PlaceStats({ place, chevron = false }: { place: PlaceSummary; chevron?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.lg,
        paddingHorizontal: 14,
        paddingVertical: 11,
        backgroundColor: COLORS.background,
      }}
    >
      <Stat icon="walk" text={formatDistance(place.distanceMeters)} />
      {/* D74: how many people favorited it (count only; never who). */}
      <View
        accessible
        accessibilityLabel={`Favorited by ${place.favoriteCount === 1 ? '1 person' : `${place.favoriteCount} people`}`}
      >
        <Stat icon="star" text={String(place.favoriteCount)} />
      </View>
      <Stat
        icon="chatbubbles"
        text={place.postCount > 0 ? plural(place.postCount, 'post') : 'No posts yet'}
        color={place.postCount > 0 ? COLORS.primary : undefined}
      />
      {chevron ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={COLORS.border}
          style={{ marginLeft: 'auto' }}
        />
      ) : null}
    </View>
  );
}

/** D78: the rounded card every place sits in (replaces D70's 2 px black frame). */
export const placeFrame = {
  marginHorizontal: SPACE.md,
  marginVertical: 6,
  borderRadius: RADIUS.lg,
  overflow: 'hidden',
  backgroundColor: COLORS.background,
} as const;

/** D78: the shape of a place card while the list loads. */
export function PlaceSkeleton() {
  return (
    <Pulse>
      <View
        style={[
          placeFrame,
          { backgroundColor: COLORS.surfaceDarkRaised, padding: 14, gap: 10 },
          elevation(1),
        ]}
      >
        <Bone w={90} h={20} r={10} dark />
        <Bone w="70%" h={18} dark />
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
          <Bone w={60} h={12} dark />
          <Bone w={36} h={12} dark />
          <Bone w={70} h={12} dark />
        </View>
      </View>
    </Pulse>
  );
}
