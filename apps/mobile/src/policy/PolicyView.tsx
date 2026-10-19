import { View } from 'react-native';
import { DARK, POLICIES, POLICY_KEYS, type PolicyKey } from '@jax/shared';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { EmptyState, PageTitle, Screen } from '@/ui';

/** P4.13: policy text bundled with the app (same text as the web pages). Draft (Q11). */
export function PolicyView({ policyKey }: { policyKey: string }) {
  if (!(POLICY_KEYS as readonly string[]).includes(policyKey)) {
    return (
      <Screen>
        <EmptyState icon="document-outline" title="Policy not found" />
      </Screen>
    );
  }
  const p = POLICIES[policyKey as PolicyKey];
  return (
    <Screen>
      <PageTitle
        title={p.title}
        subtitle={`Last updated ${p.updated}`}
        icon="document-text-outline"
      />
      <View style={{ gap: SPACE.sm }}>
        {p.sections.map((s, i) => (
          <View
            key={s.heading}
            style={{
              padding: SPACE.lg,
              borderRadius: RADIUS.lg,
              backgroundColor: DARK.card,
              gap: 6,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: DARK.raised,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: DARK.accent }}>{i + 1}</Text>
              </View>
              <Text style={[TYPE.headline, { flex: 1, fontSize: 16.5 }]}>{s.heading}</Text>
            </View>
            <Text style={[TYPE.callout, { color: DARK.textMuted, lineHeight: 23 }]}>{s.body}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}
