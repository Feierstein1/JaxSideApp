import { View } from 'react-native';
import { DARK } from '@jax/shared';
import { styles } from '@/ui';
import { Text } from '@/text';

/** The D9 ladder and appeal rules in plain words (P5.6, P5.7). */
export function HowStrikesWork() {
  return (
    <View
      style={{ marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: DARK.card, gap: 4 }}
    >
      <Text style={styles.label}>How it works</Text>
      <Text style={styles.body}>
        Breaking the Community Guidelines leads to a warning, then a 1-day suspension, then a 7-day
        suspension, then a permanent ban. Each step stops counting after 6 months. Serious cases may
        skip steps. A person reviews every step.
      </Text>
      <Text style={[styles.body, { marginTop: 8 }]}>
        You can appeal a warning or suspension within 30 days. A ban can be appealed any time; if an
        appeal isn’t accepted, you can try again after 90 days.
      </Text>
    </View>
  );
}
