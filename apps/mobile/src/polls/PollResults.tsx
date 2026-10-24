import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK, POLL_MIN_GROUP, type PollCounts, type PollView } from '@jax/shared';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { answerLabel } from './api';

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/** One bar per choice: label, percent and count; the top answer in the accent. */
function Bars({ poll, c }: { poll: PollView; c: PollCounts }) {
  const top = Math.max(...c.counts.map((x) => x.count));
  return (
    <View style={{ gap: SPACE.md }}>
      {c.average !== null ? (
        <Text accessibilityRole="text" style={{ fontSize: 15 }}>
          Average <Text style={{ fontWeight: '800', color: DARK.accent }}>{c.average}</Text> out of
          5
        </Text>
      ) : null}
      {poll.choices.map((ch) => {
        const n = c.counts.find((x) => x.choiceId === ch.id)?.count ?? 0;
        const p = pct(n, c.voters);
        const lead = n > 0 && n === top;
        return (
          <View
            key={ch.id}
            accessible
            accessibilityLabel={`${answerLabel(poll, ch)}: ${p} percent, ${n} ${n === 1 ? 'vote' : 'votes'}`}
            style={{ gap: 5 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ flex: 1, fontWeight: lead ? '800' : '600' }}>
                {answerLabel(poll, ch)}
              </Text>
              <Text style={{ fontWeight: '800', color: lead ? DARK.accent : DARK.text }}>{p}%</Text>
            </View>
            <View style={{ height: 10, borderRadius: 5, backgroundColor: DARK.raised }}>
              <View
                style={{
                  width: `${p}%`,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: lead ? DARK.accent : DARK.tealText,
                  opacity: lead ? 1 : 0.55,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * D123: a closed poll's results: citywide bars, then each ZIP code with at least 10 voters
 * (tap to open), and "Other areas" for the smaller ones combined.
 */
export function PollResults({ poll }: { poll: PollView }) {
  const r = poll.results;
  const [open, setOpen] = useState<string | null>(null);
  if (!r) return null;
  const areas = [
    ...r.areas.map((a) => ({ key: a.zip, label: `ZIP ${a.zip}`, c: a })),
    ...(r.otherAreas ? [{ key: 'other', label: 'Other areas', c: r.otherAreas }] : []),
  ];
  return (
    <View style={{ gap: SPACE.lg }}>
      <View
        style={{ backgroundColor: DARK.card, borderRadius: RADIUS.lg, padding: SPACE.lg, gap: 14 }}
      >
        <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
          All of Duval · {r.voters.toLocaleString('en-US')} {r.voters === 1 ? 'voter' : 'voters'}
        </Text>
        {r.voters ? <Bars poll={poll} c={r} /> : <Text>No one voted in this poll.</Text>}
      </View>
      {areas.length ? (
        <View style={{ gap: SPACE.sm }}>
          <Text style={TYPE.headline}>By area</Text>
          {areas.map((a) => {
            const expanded = open === a.key;
            return (
              <View
                key={a.key}
                style={{ backgroundColor: DARK.card, borderRadius: RADIUS.lg, overflow: 'hidden' }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  onPress={() => setOpen(expanded ? null : a.key)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: SPACE.md,
                    gap: SPACE.sm,
                  }}
                >
                  <Text style={{ flex: 1, fontWeight: '700' }}>{a.label}</Text>
                  <Text style={[TYPE.caption, { color: DARK.textMuted }]}>{a.c.voters} voters</Text>
                  <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={DARK.textMuted}
                  />
                </Pressable>
                {expanded ? (
                  <View style={{ paddingHorizontal: SPACE.md, paddingBottom: SPACE.md }}>
                    <Bars poll={poll} c={a.c} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
        {poll.kind === 'multi'
          ? 'People could pick more than one answer, so the percentages add up to more than 100%. '
          : ''}
        Results show JaxSide users who voted from inside Duval County, not a scientific survey of
        Jacksonville. Areas with fewer than {POLL_MIN_GROUP} voters aren’t shown on their own.
      </Text>
    </View>
  );
}
