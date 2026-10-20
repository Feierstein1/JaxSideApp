import { View } from 'react-native';
import { DARK, type Medal } from '@jax/shared';
import { Text } from '@/text';
import { TYPE } from '@/tokens';
import { MEDAL_NAMES, MedalArt, MedalBadge } from './MedalArt';

/**
 * P6.9 / D95: small medal badges after a username on posts, comments and profiles. Each
 * medal has its own shape (coin, hexagon, rosette), so they read without color.
 */
export function MedalIcons({ keys, size = 16 }: { keys: string[]; size?: number }) {
  if (!keys.length) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Medals: ${keys.map((k) => MEDAL_NAMES[k] ?? k).join(', ')}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 2 }}
    >
      {keys.map((k) => (
        <MedalBadge key={k} medalKey={k} size={size} />
      ))}
    </View>
  );
}

/** D95: the medals section of a profile: the full medal, its name, what it's for, when. */
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
      {medals.map((m, i) => (
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
          <MedalArt medalKey={m.key} size={52} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 15.5, fontWeight: '800' }}>{m.name}</Text>
            <Text style={[TYPE.caption, { color: DARK.textMuted }]}>{m.description}</Text>
            <Text style={[TYPE.caption, { color: DARK.accent, fontWeight: '700' }]}>
              Earned{' '}
              {new Date(m.awardedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
