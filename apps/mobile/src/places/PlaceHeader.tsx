import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BRAND, categoryColor, COLORS, type PlaceSummary } from '@jax/shared';
import { categoryLabel, formatDistance, plural } from '@/format';

/**
 * A place's header (D69, D70), the same in the list and on the place page: the category's
 * color, a white category pill on the left, the name (shrinks if long) and a star:
 * white outline when not a favorite, gold when it is. On the place page the star is a
 * button (`favorite`).
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
      size={large ? 26 : 18}
      color={place.isFavorite ? BRAND.gold : COLORS.onSurfaceInverse}
    />
  );
  return (
    <View
      style={{
        backgroundColor: categoryColor(place.category),
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: large ? 14 : 10,
      }}
    >
      <View
        style={{
          backgroundColor: COLORS.background,
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 3,
        }}
      >
        <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: '700' }}>
          {categoryLabel(place.category)}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{
          flex: 1,
          color: COLORS.onSurfaceInverse,
          fontWeight: '800',
          fontSize: (large ? 21 : 17) - (long ? 2 : 0),
        }}
      >
        {place.name}
      </Text>
      {favorite ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={place.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          accessibilityState={{ selected: place.isFavorite, busy: favorite.busy }}
          onPress={favorite.onPress}
          disabled={favorite.busy}
          hitSlop={10}
        >
          {favorite.busy ? <ActivityIndicator color={COLORS.onSurfaceInverse} /> : star}
        </Pressable>
      ) : place.isFavorite ? (
        <View accessibilityLabel="Favorite">{star}</View>
      ) : null}
    </View>
  );
}

/** Distance on the left, post count on the right (white row under the header). */
export function PlaceStats({ place }: { place: PlaceSummary }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 9,
        backgroundColor: COLORS.background,
      }}
    >
      <Text style={{ color: COLORS.text, fontWeight: '600' }}>
        {formatDistance(place.distanceMeters)}
      </Text>
      {/* D74: how many people favorited it (count only; never who). */}
      <View
        accessibilityLabel={`Favorited by ${place.favoriteCount === 1 ? '1 person' : `${place.favoriteCount} people`}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
      >
        <Ionicons name="star" size={15} color={COLORS.accentDark} />
        <Text style={{ color: COLORS.text, fontWeight: '600' }}>{place.favoriteCount}</Text>
      </View>
      <Text
        style={{
          color: place.postCount > 0 ? COLORS.primary : COLORS.textMuted,
          fontWeight: '600',
        }}
      >
        {place.postCount > 0 ? plural(place.postCount, 'post') : 'No posts yet'}
      </Text>
    </View>
  );
}

/** The 2 px black frame every place card has (D70). */
export const placeFrame = {
  marginHorizontal: 12,
  marginVertical: 5,
  borderRadius: 10,
  overflow: 'hidden',
  borderWidth: 2,
  borderColor: COLORS.surfaceInverse,
  backgroundColor: COLORS.background,
} as const;
