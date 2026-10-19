import { Linking, Pressable } from 'react-native';
import { DARK } from '@jax/shared';
import { styles } from '@/ui';
import { Text } from '@/text';

/** ODbL attribution, required wherever OpenStreetMap places are shown (P2.12). */
export function OsmAttribution({ dark = false }: { dark?: boolean }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}
      style={{ paddingVertical: 12 }}
    >
      <Text
        style={[
          styles.muted,
          { textAlign: 'center', fontSize: 12 },
          dark && { color: DARK.textMuted },
        ]}
      >
        Place data © OpenStreetMap contributors
      </Text>
    </Pressable>
  );
}
