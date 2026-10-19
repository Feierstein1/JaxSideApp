import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { categoryColor, DARK, SUBMIT_CATEGORIES, type PlaceCandidate } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { sendScreened } from '@/discussion/screening';
import { categoryLabel, formatDistance } from '@/format';
import { getFreshReading } from '@/location/device';
import { categoryIcon } from '@/places/PlaceHeader';
import { serverErrors, type FieldErrors } from '@/forms';
import { Banner, Button, Chip, Field, FormError, PageTitle, Screen, styles } from '@/ui';
import { Text, TextInput } from '@/text';

/**
 * P5.8 (D63): suggest a place that's missing from the list. Stand at the place: your
 * current location is used as its pin. An admin reviews every suggestion before it
 * appears; approved ones earn the Approved Contributor badge.
 */
export default function SuggestPlace() {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>();
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [similar, setSimilar] = useState<PlaceCandidate[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  // P5.9: show listed places that might be the same one while typing.
  useEffect(() => {
    const n = name.trim();
    if (n.length < 3) {
      setSimilar([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const reading = await getFreshReading();
        const r = await api.post<{ places: PlaceCandidate[] }>('/api/v1/submissions/check', {
          reading,
          name: n,
        });
        setSimilar(r.places);
      } catch {
        // Best effort; the server checks again on submit.
      }
    }, 600);
    return () => clearTimeout(t);
  }, [name]);

  async function submit() {
    if (!category) return setErrors({ category: 'Pick a category' });
    setErrors({});
    setBusy(true);
    try {
      const sent = await sendScreened(async (confirmWarning) => {
        const reading = await getFreshReading({ fresh: true });
        return api.post('/api/v1/submissions', {
          reading,
          name: name.trim(),
          category,
          ...(address.trim() ? { address: address.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          confirmWarning,
        });
      });
      if (!sent) return;
      Alert.alert(
        'Thanks for the suggestion',
        'An admin will review it. You can follow it in Account → Settings → My suggestions.',
      );
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
        title="Suggest a place"
        subtitle="Missing a spot nearby? An admin reviews every suggestion."
        icon="add-circle-outline"
      />
      <Banner icon="navigate-outline" tone="info">
        Stand at the place you’re suggesting: your current location is used as its spot on the map.
        Only the place’s location is saved with it.
      </Banner>
      <FormError>{errors.form}</FormError>
      <Field label="Name" value={name} onChangeText={setName} maxLength={120} error={errors.name} />
      {similar.length ? (
        <View
          style={{
            backgroundColor: DARK.card,
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
            borderLeftWidth: 4,
            borderLeftColor: DARK.accent,
          }}
        >
          <Text style={[styles.label]}>Already listed nearby?</Text>
          {similar.map((p) => (
            <Text
              key={p.id}
              style={[styles.linkText, { paddingVertical: 4 }]}
              onPress={() => router.replace(`/places/${p.id}`)}
            >
              {p.name} · {categoryLabel(p.category)} · {formatDistance(p.distanceMeters)}
            </Text>
          ))}
          <Text style={styles.muted}>
            If it’s one of these, tap it instead of suggesting it again.
          </Text>
        </View>
      ) : null}
      <Text style={styles.label}>Category</Text>
      <View style={[styles.row, { flexWrap: 'wrap', gap: 8 }]}>
        {SUBMIT_CATEGORIES.map((c) => (
          <Chip
            key={c}
            label={categoryLabel(c)}
            icon={categoryIcon(c)}
            iconColor={categoryColor(c)}
            active={category === c}
            onPress={() => setCategory(c)}
          />
        ))}
      </View>
      {errors.category ? <Text style={styles.error}>{errors.category}</Text> : null}
      <Field
        label="Address (optional)"
        icon="location-outline"
        value={address}
        onChangeText={setAddress}
        maxLength={200}
        error={errors.address}
      />
      <Text style={styles.label}>Notes for the reviewer (optional)</Text>
      <TextInput
        accessibilityLabel="Notes for the reviewer"
        value={notes}
        onChangeText={setNotes}
        maxLength={1000}
        multiline
        placeholder="Anything that helps, like opening hours or what it is"
        placeholderTextColor={DARK.placeholder}
        style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
      />
      <Button title="Send suggestion" onPress={() => void submit()} busy={busy} />
    </Screen>
  );
}
