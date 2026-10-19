import { ActivityIndicator, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CATEGORY_GROUPS, categoryColor, DARK, type PlaceSummary } from '@jax/shared';
import { categoryLabel, formatDistance, plural } from '@/format';
import { haptic } from '@/motion';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { Bone, PressableScale, Pulse, StatTile, type IconName } from '@/ui';

/** D78: an icon per category group (pill, tile, favorites list, filter chips). */
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

/** The category color as a thick stripe down the card's left edge (D79). */
function Stripe({ color }: { color: string }) {
  return (
    <View
      style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, backgroundColor: color }}
    />
  );
}

/** A rounded tile in the category color with the category's icon in white. */
export function CategoryTile({ category, size = 52 }: { category: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: categoryColor(category),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={categoryIcon(category)} size={size * 0.48} color={DARK.onTeal} />
    </View>
  );
}

function Meta({ icon, text, color }: { icon: IconName; text: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons name={icon} size={14} color={color ?? DARK.textMuted} />
      <Text style={{ color: color ?? DARK.textMuted, fontWeight: '700', fontSize: 13 }}>
        {text}
      </Text>
    </View>
  );
}

/**
 * One place in the list (D79). A dark card with the category color as a thick stripe on
 * the left; a colored icon tile; the name large; category and distance under it; then
 * posts and favorites. A gold ★ shows on your favorites. Every listed place is within your
 * radius, so you can post at any of them (no "You can post" badge, D82).
 */
export function PlaceRow({ place, onPress }: { place: PlaceSummary; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${place.name}, ${categoryLabel(place.category)}, ${formatDistance(place.distanceMeters)} away, ${plural(place.postCount, 'post')}, ${plural(place.favoriteCount, 'favorite')}${place.isFavorite ? ', one of your favorites' : ''}`}
      onPress={onPress}
      scaleTo={0.98}
      containerStyle={{ marginHorizontal: SPACE.md, marginVertical: 6 }}
      style={{
        borderRadius: RADIUS.lg,
        overflow: 'hidden',
        backgroundColor: DARK.card,
      }}
    >
      <Stripe color={categoryColor(place.category)} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingLeft: 20,
          paddingRight: 14,
          paddingVertical: 14,
        }}
      >
        <CategoryTile category={place.category} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text
              numberOfLines={2}
              style={{ fontSize: 17, lineHeight: 22, fontWeight: '800', flexShrink: 1 }}
            >
              {place.name}
            </Text>
            {place.isFavorite ? <Ionicons name="star" size={15} color={DARK.accent} /> : null}
          </View>
          <Text style={{ color: DARK.textMuted, fontSize: 13.5, fontWeight: '500' }}>
            {categoryLabel(place.category)}
            <Text style={{ color: DARK.textMuted }}>{'  ·  '}</Text>
            <Text style={{ color: DARK.text, fontWeight: '700' }}>
              {formatDistance(place.distanceMeters)}
            </Text>
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 5 }}>
            <Meta
              icon="chatbubbles"
              text={place.postCount > 0 ? plural(place.postCount, 'post') : 'No posts yet'}
              color={place.postCount > 0 ? DARK.tealText : undefined}
            />
            {place.favoriteCount > 0 ? (
              <Meta icon="star" text={String(place.favoriteCount)} />
            ) : null}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <Ionicons name="chevron-forward" size={18} color={DARK.textMuted} />
        </View>
      </View>
    </PressableScale>
  );
}

/**
 * The top of a place's page (D79): the same stripe and tile as the list, bigger; the name
 * large; category and address; three stat tiles; and a full-width Save button (gold
 * when saved).
 */
export function PlaceHero({
  place,
  onFavorite,
  favoriteBusy,
}: {
  place: PlaceSummary;
  onFavorite: () => void;
  favoriteBusy: boolean;
}) {
  const color = categoryColor(place.category);
  return (
    <View
      style={{
        marginHorizontal: SPACE.md,
        marginTop: SPACE.md,
        borderRadius: RADIUS.lg + 4,
        overflow: 'hidden',
        backgroundColor: DARK.card,
      }}
    >
      <Stripe color={color} />
      <View style={{ paddingLeft: 22, paddingRight: SPACE.lg, paddingVertical: 18, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <CategoryTile category={place.category} size={64} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text accessibilityRole="header" style={[TYPE.title, { fontSize: 24, lineHeight: 29 }]}>
              {place.name}
            </Text>
            <Text style={{ color: DARK.textMuted, fontWeight: '600' }}>
              {categoryLabel(place.category)}
            </Text>
          </View>
        </View>
        {place.address ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Ionicons name="location-outline" size={17} color={DARK.textMuted} />
            <Text style={[TYPE.callout, { flex: 1, color: DARK.textMuted }]}>{place.address}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          <StatTile icon="walk" value={formatDistance(place.distanceMeters)} label="Away" />
          <StatTile
            icon="chatbubbles"
            value={String(place.postCount)}
            label={place.postCount === 1 ? 'Post' : 'Posts'}
            color={DARK.tealText}
          />
          <StatTile
            icon="star"
            value={String(place.favoriteCount)}
            label={place.favoriteCount === 1 ? 'Favorite' : 'Favorites'}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={place.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          accessibilityState={{ selected: place.isFavorite, busy: favoriteBusy }}
          disabled={favoriteBusy}
          onPress={() => {
            haptic.tap();
            onFavorite();
          }}
          style={({ pressed }) => ({
            minHeight: 48,
            borderRadius: RADIUS.md + 2,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderWidth: 1.5,
            borderColor: DARK.accent,
            backgroundColor: place.isFavorite ? DARK.accent : 'transparent',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          {favoriteBusy ? (
            <ActivityIndicator color={place.isFavorite ? DARK.onAccent : DARK.accent} />
          ) : (
            <>
              <Ionicons
                name={place.isFavorite ? 'star' : 'star-outline'}
                size={19}
                color={place.isFavorite ? DARK.onAccent : DARK.accent}
              />
              <Text
                style={{
                  fontWeight: '800',
                  fontSize: 15.5,
                  color: place.isFavorite ? DARK.onAccent : DARK.accent,
                }}
              >
                {place.isFavorite ? 'Saved to favorites' : 'Save to favorites'}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

/** The shape of a place card while the list loads. */
export function PlaceSkeleton() {
  return (
    <Pulse>
      <View
        style={{
          marginHorizontal: SPACE.md,
          marginVertical: 6,
          borderRadius: RADIUS.lg,
          backgroundColor: DARK.card,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingLeft: 20,
          paddingVertical: 14,
        }}
      >
        <Bone w={52} h={52} r={16} />
        <View style={{ gap: 8, flex: 1 }}>
          <Bone w="65%" h={16} />
          <Bone w="40%" h={12} />
          <Bone w="50%" h={12} />
        </View>
      </View>
    </Pulse>
  );
}
