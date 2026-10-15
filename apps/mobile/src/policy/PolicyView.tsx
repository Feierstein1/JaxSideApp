import { ScrollView, Text, View } from 'react-native';
import { POLICIES, POLICY_KEYS, type PolicyKey } from '@jax/shared';
import { styles } from '@/ui';

/** P4.13: policy text bundled with the app (same text as the web pages). Draft (Q11). */
export function PolicyView({ policyKey }: { policyKey: string }) {
  if (!(POLICY_KEYS as readonly string[]).includes(policyKey)) {
    return <Text style={[styles.screen, styles.muted]}>Not found.</Text>;
  }
  const p = POLICIES[policyKey as PolicyKey];
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>{p.title}</Text>
      <Text style={[styles.muted, { marginBottom: 12 }]}>Last updated {p.updated}</Text>
      {p.sections.map((s) => (
        <View key={s.heading} style={{ marginBottom: 14 }}>
          <Text style={[styles.label, { fontSize: 16 }]}>{s.heading}</Text>
          <Text style={styles.body}>{s.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
