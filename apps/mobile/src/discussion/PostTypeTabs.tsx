import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { BRAND, COLORS, type PostTypeFilter } from '@jax/shared';

/** D75: shown types. Video joins when video posts are built (P8.9). */
const TABS: {
  key: PostTypeFilter;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
}[] = [
  { key: 'all', label: 'All', icon: 'albums-outline' },
  { key: 'text', label: 'Text', icon: 'chatbox-outline' },
  { key: 'media', label: 'Media', icon: 'image-outline' },
  { key: 'voice', label: 'Voice', icon: 'mic-outline' },
];

/**
 * D75: the permanent post-type bar on Home and place pages, on the black bar: white
 * labels, the active one gold-underlined (gold on black only, D33).
 */
export function PostTypeTabs({
  value,
  onChange,
}: {
  value: PostTypeFilter;
  onChange: (t: PostTypeFilter) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row' }}>
      {TABS.map((t) => {
        const active = t.key === value;
        const color = active ? BRAND.gold : COLORS.onSurfaceInverse;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityLabel={`${t.label} posts`}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(t.key)}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 5,
              borderBottomWidth: 3,
              borderBottomColor: active ? BRAND.gold : 'transparent',
            }}
          >
            <Ionicons name={t.icon} size={16} color={color} />
            <Text style={{ color, fontWeight: active ? '800' : '600' }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
