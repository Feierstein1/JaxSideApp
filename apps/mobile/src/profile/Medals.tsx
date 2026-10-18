import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, type Medal } from '@jax/shared';
import { styles } from '@/ui';

/** P6.9: medal icons. Old gold is for medals and icons only (D33), never body text. */
const ICON: Record<string, ComponentProps<typeof Ionicons>['name']> = {
  first_contribution: 'sparkles',
  approved_contributor: 'location',
  well_received: 'thumbs-up',
};
const LABEL: Record<string, string> = {
  first_contribution: 'First Contribution',
  approved_contributor: 'Approved Contributor',
  well_received: 'Well Received',
};
const iconFor = (key: string) => ICON[key] ?? 'ribbon';

/** Small icons after a username on posts and comments. */
export function MedalIcons({
  keys,
  size = 13,
  color = COLORS.accentDark,
}: {
  keys: string[];
  size?: number;
  /** On a colored post header, the header's text color (D69). */
  color?: string;
}) {
  if (!keys.length) return null;
  return (
    <Text accessibilityLabel={`Medals: ${keys.map((k) => LABEL[k] ?? k).join(', ')}`}>
      {keys.map((k) => (
        <Text key={k}>
          {' '}
          <Ionicons name={iconFor(k)} size={size} color={color} />
        </Text>
      ))}
    </Text>
  );
}

/** The medals section of a profile. */
export function MedalList({ medals }: { medals: Medal[] }) {
  if (!medals.length) {
    return (
      <Text style={styles.muted}>
        No medals yet. They come with your first post, approved place suggestions and well-received
        posts.
      </Text>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      {medals.map((m) => (
        <View key={m.key} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              borderWidth: 2,
              borderColor: COLORS.accent,
              backgroundColor: COLORS.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Old gold icon on the light gold tint (icons need 3:1, D33). */}
            <Ionicons name={iconFor(m.key)} size={21} color={COLORS.accentDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{m.name}</Text>
            <Text style={styles.muted}>{m.description}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
