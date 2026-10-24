import { View } from 'react-native';
import { DARK, MEDAL_METALS, type Medal, type MedalBadge as MedalBadgeData } from '@jax/shared';
import { Text } from '@/text';
import { TYPE } from '@/tokens';
import { MedalArt, MedalBadge, medalLabel } from './MedalArt';

/**
 * P6.9 / D95 / D122: small medal badges after a username on posts, comments and profiles,
 * each in its level's metal. Each medal has its own shape, so they read without color.
 */
export function MedalIcons({ medals, size = 16 }: { medals: MedalBadgeData[]; size?: number }) {
  if (!medals.length) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Medals: ${medals.map((m) => medalLabel(m.key, m.tier)).join(', ')}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 2 }}
    >
      {medals.map((m) => (
        <MedalBadge key={m.key} medalKey={m.key} tier={m.tier} size={size} />
      ))}
    </View>
  );
}

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * D95 / D122: the medals section of a profile: the full medal in its metal, its name and
 * level, what it's for, when that level was reached, and what the next level takes.
 */
export function MedalList({ medals }: { medals: Medal[] }) {
  if (!medals.length) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ opacity: 0.35 }}>
          <MedalArt medalKey="first_contribution" size={44} />
        </View>
        <Text style={[TYPE.callout, { flex: 1, color: DARK.textMuted }]}>
          No medals yet. Your first one comes a day after your first post or comment.
        </Text>
      </View>
    );
  }
  return (
    <View>
      {medals.map((m, i) => {
        const metal = MEDAL_METALS[m.tier - 1] ?? MEDAL_METALS[0];
        return (
          <View
            key={m.key}
            style={{
              flexDirection: 'row',
              gap: 14,
              alignItems: 'center',
              paddingVertical: 10,
              borderTopWidth: i ? 1 : 0,
              borderTopColor: DARK.hairline,
            }}
          >
            <MedalArt medalKey={m.key} tier={m.tier} size={52} />
            <View style={{ flex: 1, gap: 2 }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
              >
                <Text style={{ fontSize: 15.5, fontWeight: '800' }}>{m.name}</Text>
                {m.levels > 1 ? (
                  <View
                    style={{
                      backgroundColor: metal.main,
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 1,
                    }}
                  >
                    <Text style={{ color: metal.on, fontSize: 11.5, fontWeight: '800' }}>
                      {m.tierName}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[TYPE.caption, { color: DARK.textMuted }]}>{m.description}</Text>
              <Text style={[TYPE.caption, { color: DARK.accent, fontWeight: '700' }]}>
                {m.levels > 1 && m.tier > 1
                  ? `${m.tierName} since ${date(m.tierAt)}`
                  : `Earned ${date(m.awardedAt)}`}
              </Text>
              {m.next ? (
                <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
                  Next: {m.next.tierName} at {m.next.needs}
                </Text>
              ) : m.levels > 1 ? (
                <Text style={[TYPE.caption, { color: DARK.textMuted }]}>Top level reached</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
