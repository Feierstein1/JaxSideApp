import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { DARK, POLL_TOPICS, suggestPollSchema, type PollTopic } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { showAlert } from '@/dialog';
import { serverErrors, validate, type FieldErrors } from '@/forms';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { Button, Chip, Field, FormError, PageTitle, Screen } from '@/ui';

/**
 * D133: suggest a poll question. The JaxSide team reviews suggestions and turns good ones
 * into polls (wording may be adjusted to keep it neutral).
 */
export default function SuggestPollScreen() {
  const [question, setQuestion] = useState('');
  const [details, setDetails] = useState('');
  const [topic, setTopic] = useState<PollTopic>('other');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    const v = validate(suggestPollSchema, {
      question,
      topic,
      ...(details.trim() ? { details } : {}),
    });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    try {
      await api.post('/api/v1/polls/suggestions', v.data);
      showAlert(
        'Thanks for the idea',
        'We’ll take a look. Good questions become polls everyone in Jacksonville can answer.',
        undefined,
        { icon: 'checkmark-done-circle', tone: 'success' },
      );
      router.back();
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
        title="Suggest a poll"
        subtitle="Ask something Jacksonville can answer. Keep it neutral so anyone can answer comfortably."
      />
      <FormError>{errors.form}</FormError>
      <Field
        label="Question"
        icon="help-circle-outline"
        value={question}
        onChangeText={setQuestion}
        maxLength={200}
        placeholder="e.g. How do you usually get downtown?"
        error={errors.question}
      />
      <Text style={[TYPE.label, { marginBottom: SPACE.sm }]}>Topic</Text>
      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginBottom: SPACE.lg }}
      >
        {(Object.keys(POLL_TOPICS) as PollTopic[]).map((t) => (
          <Chip key={t} label={POLL_TOPICS[t]} active={topic === t} onPress={() => setTopic(t)} />
        ))}
      </View>
      <Field
        label="Answers or details you have in mind (optional)"
        value={details}
        onChangeText={setDetails}
        maxLength={500}
        multiline
        error={errors.details}
      />
      <Button title="Send suggestion" onPress={() => void submit()} busy={busy} />
      <Text style={[TYPE.caption, { color: DARK.textMuted, marginTop: SPACE.sm }]}>
        Up to 3 suggestions a day.
      </Text>
    </Screen>
  );
}
