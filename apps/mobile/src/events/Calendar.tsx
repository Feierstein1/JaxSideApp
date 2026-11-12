import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK, monthGrid, monthLabel, WEEKDAY_LETTERS } from '@jax/shared';
import { haptic } from '@/motion';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';

/**
 * D230: the month calendar. Every day square is the same size whatever its count (a row of
 * 7 equal squares per week); today is outlined; a day shows only how many events it has.
 */
export function Calendar({
  month,
  today,
  days,
  onMonth,
  onDay,
}: {
  month: string;
  today: string;
  /** 'YYYY-MM-DD' → number of events (days without any are left out). */
  days: Record<string, number> | null;
  onMonth: (step: -1 | 1) => void;
  onDay: (date: string) => void;
}) {
  const weeks = monthGrid(month);
  return (
    <View style={{ gap: SPACE.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <MonthButton icon="chevron-back" label="Previous month" onPress={() => onMonth(-1)} />
        <Text accessibilityRole="header" style={[TYPE.headline, { flex: 1, textAlign: 'center' }]}>
          {monthLabel(month)}
        </Text>
        <MonthButton icon="chevron-forward" label="Next month" onPress={() => onMonth(1)} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAY_LETTERS.map((l, i) => (
          <Text
            key={i}
            importantForAccessibility="no"
            style={[TYPE.caption, { flex: 1, textAlign: 'center', color: DARK.textMuted }]}
          >
            {l}
          </Text>
        ))}
      </View>
      {weeks.map((week, w) => (
        <View key={w} style={{ flexDirection: 'row', gap: 4 }}>
          {week.map((date, i) =>
            date ? (
              <DaySquare
                key={date}
                date={date}
                count={days?.[date] ?? 0}
                isToday={date === today}
                past={date < today}
                onPress={() => onDay(date)}
              />
            ) : (
              <View key={`blank-${i}`} style={{ flex: 1, aspectRatio: 1 }} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

function MonthButton({
  icon,
  label,
  onPress,
}: {
  icon: 'chevron-back' | 'chevron-forward';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      hitSlop={8}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name={icon} size={22} color={DARK.accent} />
    </Pressable>
  );
}

function DaySquare({
  date,
  count,
  isToday,
  past,
  onPress,
}: {
  date: string;
  count: number;
  isToday: boolean;
  past: boolean;
  onPress: () => void;
}) {
  const day = Number(date.slice(8));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${date}${isToday ? ', today' : ''}: ${count === 0 ? 'no events' : count === 1 ? '1 event' : `${count} events`}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        aspectRatio: 1,
        borderRadius: RADIUS.md,
        backgroundColor: count ? DARK.card : 'transparent',
        borderWidth: isToday ? 2 : 1,
        borderColor: isToday ? DARK.accent : DARK.hairline,
        padding: 4,
        justifyContent: 'space-between',
        opacity: pressed ? 0.7 : past ? 0.55 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: isToday ? '800' : '600',
          color: isToday ? DARK.accent : DARK.text,
        }}
      >
        {day}
      </Text>
      {count ? (
        // Just the number, in the accent blue (no badge behind it).
        <Text
          style={{ alignSelf: 'flex-end', fontSize: 13, fontWeight: '800', color: DARK.accent }}
        >
          {count > 99 ? '99+' : count}
        </Text>
      ) : null}
    </Pressable>
  );
}
