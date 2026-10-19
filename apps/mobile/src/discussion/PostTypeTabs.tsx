import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { DARK, type PostTypeFilter } from '@jax/shared';
import { haptic } from '@/motion';
import { Text } from '@/text';

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
 * labels, the active one gold with a filled icon and a short gold bar under it (gold on
 * black only, D33).
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
        const color = active ? DARK.accent : DARK.textMuted;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityLabel={`${t.label} posts`}
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) haptic.select();
              onChange(t.key);
            }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons
                name={active ? (t.icon.replace('-outline', '') as typeof t.icon) : t.icon}
                size={16}
                color={color}
              />
              <Text style={{ color, fontWeight: active ? '800' : '600', fontSize: 14 }}>
                {t.label}
              </Text>
            </View>
            {/* D78: a short rounded gold bar under the active tab. */}
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                width: 44,
                height: 3,
                borderRadius: 2,
                backgroundColor: active ? DARK.accent : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
