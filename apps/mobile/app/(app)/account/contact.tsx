import { useState } from 'react';
import { Switch, View } from 'react-native';
import { router } from 'expo-router';
import { contactSchema, DARK } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { serverErrors, validate, type FieldErrors } from '@/forms';
import { haptic } from '@/motion';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import {
  Banner,
  Button,
  Field,
  FormError,
  ListGroup,
  ListRow,
  PageTitle,
  Screen,
  Segmented,
  switchColors,
} from '@/ui';

type Category = 'SUPPORT' | 'GENERAL';

/**
 * D90: Contact us. A support ticket (something isn't working) or a general message; it
 * goes to the moderators' admin portal. Your email is shared only if you turn on replies.
 */
export default function ContactUs() {
  const { state } = useAuth();
  const signedIn = state.status === 'signedIn';
  const [category, setCategory] = useState<Category>('SUPPORT');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [allowReply, setAllowReply] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    const input = { category, subject, body, allowReply: signedIn && allowReply };
    const v = validate(contactSchema, input);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await api.post('/api/v1/contact', v.data);
      haptic.success();
      setSent(true);
    } catch (e) {
      setErrors(
        e instanceof ApiRequestError ? serverErrors(e) : { form: 'Couldn’t send. Try again.' },
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Screen>
        <PageTitle title="Thanks!" icon="checkmark-circle-outline" inline />
        <Banner icon="mail-open-outline" tone="success">
          {category === 'SUPPORT'
            ? 'Your support ticket was sent. We’ll look into it.'
            : 'Your message was sent.'}
          {signedIn && allowReply ? ' We may reply to your account email.' : ''}
        </Banner>
        <Button title="Done" onPress={() => router.back()} style={{ marginTop: SPACE.lg }} />
      </Screen>
    );
  }

  return (
    <Screen keyboard>
      <PageTitle title="Contact us" icon="chatbubbles-outline" inline />
      <Segmented
        stretch
        options={[
          { key: 'SUPPORT', label: 'Support ticket', icon: 'construct-outline' },
          { key: 'GENERAL', label: 'General', icon: 'chatbubble-ellipses-outline' },
        ]}
        value={category}
        onChange={(k) => setCategory(k as Category)}
      />
      <Text style={[TYPE.callout, { color: DARK.textMuted, marginVertical: SPACE.md }]}>
        {category === 'SUPPORT'
          ? 'Something not working? Tell us what you were doing and what happened.'
          : 'Ideas, questions or anything else.'}
      </Text>
      <FormError>{errors.form}</FormError>
      <Field
        label="Subject"
        value={subject}
        onChangeText={setSubject}
        maxLength={100}
        error={errors.subject}
      />
      <Field
        label="Message"
        value={body}
        onChangeText={setBody}
        maxLength={2000}
        multiline
        textAlignVertical="top"
        style={{ minHeight: 140 }}
        error={errors.body}
      />
      {signedIn ? (
        <ListGroup footer="Off: we can read your message but can’t write back. Your email is never shown to anyone else.">
          <ListRow
            icon="mail-outline"
            label="You can reply to my account email"
            right={
              <Switch
                accessibilityLabel="You can reply to my account email"
                value={allowReply}
                onValueChange={setAllowReply}
                {...switchColors}
              />
            }
          />
        </ListGroup>
      ) : (
        <Text style={[TYPE.caption, { color: DARK.textMuted, marginBottom: SPACE.md }]}>
          You’re a guest, so we can’t reply. Sign up if you’d like an answer.
        </Text>
      )}
      <View style={{ marginTop: SPACE.sm }}>
        <Button title="Send" icon="send" busy={busy} onPress={() => void send()} />
      </View>
    </Screen>
  );
}
