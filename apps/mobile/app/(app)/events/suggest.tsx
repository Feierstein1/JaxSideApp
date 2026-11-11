import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  addMonths,
  dateLabel,
  DARK,
  EVENT_CATEGORIES,
  EVENT_SETTINGS,
  localDate,
  timeLabel,
  type EventCategory,
  type EventSetting,
} from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { showAlert } from '@/dialog';
import { suggestEvent } from '@/events/api';
import { Calendar } from '@/events/Calendar';
import { serverErrors, type FieldErrors } from '@/forms';
import { Text } from '@/text';
import { SPACE } from '@/tokens';
import { Banner, Button, Chip, Field, FormError, PageTitle, Screen, styles } from '@/ui';

/** Every half hour, 6:00 AM to 11:30 PM (and midnight for late shows). */
const TIMES = Array.from({ length: 37 }, (_, i) => {
  const m = (6 * 60 + i * 30) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});

function TimeRow({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (t: string) => void;
  label: string;
}) {
  return (
    <View style={{ gap: SPACE.xs }}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6 }}
      >
        {TIMES.map((t) => (
          <Chip key={t} label={timeLabel(t)} active={value === t} onPress={() => onChange(t)} />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * D230: tell JaxSide about an event that's missing. It's checked (and its spot set) before it
 * goes on the calendar; you can follow it under My suggestions.
 */
export default function SuggestEvent() {
  const today = localDate(new Date());
  const [title, setTitle] = useState('');
  const [where, setWhere] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EventCategory>();
  const [setting, setSetting] = useState<EventSetting>('outdoor');
  const [free, setFree] = useState(true);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [date, setDate] = useState<string>();
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('21:00');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!category) return setErrors({ category: 'Pick a category' });
    if (!date) return setErrors({ date: 'Pick the day on the calendar' });
    setErrors({});
    setBusy(true);
    try {
      const r = await suggestEvent({
        title: title.trim(),
        description: description.trim(),
        category,
        setting,
        free,
        where: where.trim(),
        sessions: [{ date, start, end }],
      });
      showAlert('Thanks for the suggestion', r.message, undefined, {
        icon: 'calendar-outline',
        tone: 'success',
      });
      router.back();
    } catch (e) {
      setErrors(e instanceof ApiRequestError ? serverErrors(e) : { form: 'Couldn’t send it.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboard>
      <PageTitle
        title="Suggest an event"
        subtitle="Know about something that isn’t on the calendar?"
        icon="add-circle-outline"
      />
      <Banner icon="information-circle-outline" tone="info">
        JaxSide checks every event before it goes on the calendar. Real local events only, please.
      </Banner>
      <FormError>{errors.form}</FormError>
      <Field
        label="Event name"
        value={title}
        onChangeText={setTitle}
        maxLength={100}
        error={errors.title}
      />
      <Field
        label="Where is it?"
        hint="A place name, an address, or both"
        value={where}
        onChangeText={setWhere}
        maxLength={300}
        error={errors.where}
      />
      <Text style={styles.label}>Category</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
        {(Object.keys(EVENT_CATEGORIES) as EventCategory[]).map((c) => (
          <Chip
            key={c}
            label={EVENT_CATEGORIES[c]}
            active={category === c}
            onPress={() => setCategory(c)}
          />
        ))}
      </View>
      <FormError>{errors.category}</FormError>
      <Text style={styles.label}>Day</Text>
      <Calendar
        month={month}
        today={today}
        days={date ? { [date]: 1 } : {}}
        onMonth={(step) => setMonth((m) => addMonths(m, step))}
        onDay={(d) => (d >= today ? setDate(d) : undefined)}
      />
      <Text style={[styles.muted, { marginVertical: 6 }]}>
        {date ? `Picked: ${dateLabel(date)}` : 'Tap the day it happens.'}
      </Text>
      <FormError>{errors.date ?? errors.sessions}</FormError>
      <TimeRow label="Starts" value={start} onChange={setStart} />
      <TimeRow label="Ends" value={end} onChange={setEnd} />
      <Text style={[styles.label, { marginTop: SPACE.md }]}>Setting</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(Object.keys(EVENT_SETTINGS) as EventSetting[]).map((s) => (
          <Chip
            key={s}
            label={EVENT_SETTINGS[s]}
            active={setting === s}
            onPress={() => setSetting(s)}
          />
        ))}
      </View>
      <Text style={[styles.label, { marginTop: SPACE.md }]}>Cost</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: SPACE.md }}>
        <Chip label="Free" active={free} onPress={() => setFree(true)} />
        <Chip label="Paid" active={!free} onPress={() => setFree(false)} />
      </View>
      <Field
        label="What is it?"
        value={description}
        onChangeText={setDescription}
        maxLength={1000}
        multiline
        error={errors.description}
        style={{ minHeight: 90, textAlignVertical: 'top' }}
      />
      <Button
        title="Send suggestion"
        icon="send"
        busy={busy}
        disabled={title.trim().length < 3 || where.trim().length < 3 || !description.trim()}
        onPress={() => void submit()}
      />
      <Text style={[styles.muted, { textAlign: 'center', color: DARK.textMuted }]}>
        Up to 3 a day.
      </Text>
    </Screen>
  );
}
