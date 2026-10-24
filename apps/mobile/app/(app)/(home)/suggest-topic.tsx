import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import {
  DARK,
  suggestTopicSchema,
  TOPIC_DESCRIPTION_MAX,
  TOPIC_TITLE_MAX,
  type MyTopicSuggestion,
} from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useGuest } from '@/auth/guest';
import { showAlert } from '@/dialog';
import { serverErrors, validate, type FieldErrors } from '@/forms';
import { fetchMySuggestions, suggestTopic } from '@/topics/api';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { Button, Field, FormError, PageTitle, Screen, SectionTitle } from '@/ui';

const STATUS = {
  waiting: { label: 'Waiting for review', icon: 'time-outline', color: DARK.textMuted },
  approved: { label: 'Approved', icon: 'checkmark-circle', color: DARK.accent },
  rejected: { label: 'Not approved', icon: 'close-circle-outline', color: DARK.error },
} as const;

/**
 * D125: suggest a citywide topic; it appears once the JaxSide team approves it. Below, your
 * suggestions and what happened to each (with the reason if one wasn't approved).
 */
export default function SuggestTopicScreen() {
  const { state } = useAuth();
  const { isGuest, promptAccount } = useGuest();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<MyTopicSuggestion[]>([]);
  const signedIn = state.status === 'signedIn';

  const loadMine = useCallback(async () => {
    if (!signedIn) return;
    setMine(await fetchMySuggestions().catch(() => []));
  }, [signedIn]);
  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  async function submit() {
    if (isGuest) return promptAccount('suggest topics');
    const v = validate(suggestTopicSchema, {
      title,
      ...(description.trim() ? { description } : {}),
    });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    try {
      await suggestTopic(v.data);
      setTitle('');
      setDescription('');
      void loadMine();
      showAlert(
        'Thanks for the idea',
        'We’ll take a look. If it’s approved, it shows up under Citywide on Home.',
        undefined,
        { icon: 'checkmark-done-circle', tone: 'success' },
      );
    } catch (e) {
      setErrors(e instanceof ApiRequestError ? serverErrors(e) : { form: 'Try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboard>
      <PageTitle
        icon="add-circle-outline"
        title="Suggest a topic"
        subtitle="Something all of Jacksonville can talk about: a game, an election, a big event, a question for the city."
      />
      <FormError>{errors.form}</FormError>
      <Field
        label="Topic"
        icon="chatbubbles-outline"
        value={title}
        onChangeText={setTitle}
        maxLength={TOPIC_TITLE_MAX}
        placeholder="e.g. Best tacos in Jax"
        error={errors.title}
      />
      <Field
        label="Why it’s a good one (optional)"
        value={description}
        onChangeText={setDescription}
        maxLength={TOPIC_DESCRIPTION_MAX}
        multiline
        error={errors.description}
      />
      <Button title="Send suggestion" onPress={() => void submit()} busy={busy} />
      <Text style={[TYPE.caption, { color: DARK.textMuted, marginTop: SPACE.sm }]}>
        Up to 3 suggestions a day. The usual community guidelines apply.
      </Text>

      {mine.length ? (
        <>
          <SectionTitle>Your suggestions</SectionTitle>
          <View style={{ gap: SPACE.sm }}>
            {mine.map((s) => {
              const st = STATUS[s.status];
              return (
                <View
                  key={s.id}
                  style={{
                    padding: SPACE.md,
                    borderRadius: RADIUS.lg,
                    backgroundColor: DARK.card,
                    gap: 4,
                  }}
                >
                  <Text style={{ fontWeight: '700' }}>{s.title}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name={st.icon} size={14} color={st.color} />
                    <Text style={[TYPE.caption, { color: st.color, fontWeight: '700' }]}>
                      {st.label}
                    </Text>
                  </View>
                  {s.reason ? (
                    <Text style={[TYPE.caption, { color: DARK.textMuted }]}>{s.reason}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </>
      ) : null}
      <Button
        variant="link"
        title="See all topics"
        onPress={() => router.push('/topics')}
        style={{ marginTop: SPACE.lg }}
      />
    </Screen>
  );
}
