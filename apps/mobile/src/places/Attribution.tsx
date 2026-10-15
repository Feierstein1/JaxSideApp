import { Linking, Pressable, Text } from 'react-native';
import { styles } from '@/ui';

/** ODbL attribution, required wherever OpenStreetMap places are shown (P2.12). */
export function OsmAttribution() {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}
      style={{ paddingVertical: 12 }}
    >
      <Text style={[styles.muted, { textAlign: 'center', fontSize: 12 }]}>
        Place data © OpenStreetMap contributors
      </Text>
    </Pressable>
  );
}
