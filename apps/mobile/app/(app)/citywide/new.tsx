import { useEffect, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  CONFIG_DEFAULTS,
  createTopicSchema,
  DARK,
  TOPIC_CATEGORIES,
  TOPIC_DESCRIPTION_MAX,
  TOPIC_TITLE_MAX,
  yardsLabel,
  type TopicCategory,
  type TopicScope,
} from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { isHeld, sendScreened } from '@/discussion/screening';
import { serverErrors, validate, type FieldErrors } from '@/forms';
import { ensureGuide } from '@/guides/guide';
import { haptic } from '@/motion';
import { createTopic } from '@/topics/api';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { Button, Chip, Field, FormError, PageTitle, Screen, Segmented, switchColors } from '@/ui';

const LOCAL_RADIUS = yardsLabel(CONFIG_DEFAULTS['topics.localRadiusMiles']);

/**
 * D133: start a topic: City (all of Jacksonville) or Near me (people within half a mile of
 * where you are now). The first time, the dos-and-don'ts guide comes first.
 */
export default function NewTopicScreen() {
  const params = useLocalSearchParams<{ scope?: string }>();
  const [scope, setScope] = useState<TopicScope>(params.scope === 'local' ? 'local' : 'city');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TopicCategory>('other');
  const [description, setDescription] = useState('');
  const [showCreator, setShowCreator] = useState(false); // D134: off by default
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  // D133: the first topic shows its guide; closing it leaves this screen.
  useEffect(() => {
    void ensureGuide('topicCreate').then((ok) => {
      if (!ok) router.back();
    });
  }, []);

  async function submit() {
    const body = {
      scope,
      title,
      category,
      showCreator,
      ...(description.trim() ? { description } : {}),
    };
    const v = validate(createTopicSchema.omit({ reading: true }), body);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    try {
      const r = await sendScreened((confirmWarning) =>
        createTopic({ ...v.data, ...(confirmWarning ? { confirmWarning } : {}) }),
      );
      if (!r) return; // chose to edit after a warning
      haptic.success();
      // D142: held for review: sendScreened already said so; nothing to open yet.
      if (isHeld(r)) return router.back();
      router.replace(`/citywide/topic/${r.topic.id}`);
    } catch (e) {
      setErrors(e instanceof ApiRequestError ? serverErrors(e) : { form: 'Try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboard>
      <PageTitle icon="add-circle-outline" title="Start a topic" />
      <Segmented
        stretch
        options={[
          { key: 'city', label: 'City', icon: 'globe-outline' },
          { key: 'local', label: 'Near me', icon: 'navigate-outline' },
        ]}
        value={scope}
        onChange={(v) => setScope(v as TopicScope)}
      />
      <Text
        style={[
          TYPE.caption,
          { color: DARK.textMuted, marginTop: SPACE.sm, marginBottom: SPACE.lg },
        ]}
      >
        {scope === 'local'
          ? `Only people within ${LOCAL_RADIUS} of where you are now can see it and join in.`
          : 'Anyone in Jacksonville (Duval County) can see it and join in.'}
      </Text>
      <FormError>{errors.form}</FormError>
      <Field
        label="Title"
        icon="chatbubbles-outline"
        value={title}
        onChangeText={setTitle}
        maxLength={TOPIC_TITLE_MAX}
        placeholder={scope === 'local' ? 'e.g. Road work on Park Street' : 'e.g. Best tacos in Jax'}
        error={errors.title}
      />
      <Text style={[TYPE.label, { marginBottom: SPACE.sm }]}>Category</Text>
      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginBottom: SPACE.lg }}
      >
        {(Object.keys(TOPIC_CATEGORIES) as TopicCategory[]).map((c) => (
          <Chip
            key={c}
            label={TOPIC_CATEGORIES[c]}
            active={category === c}
            onPress={() => setCategory(c)}
          />
        ))}
      </View>
      <Field
        label="What it’s about (optional)"
        value={description}
        onChangeText={setDescription}
        maxLength={TOPIC_DESCRIPTION_MAX}
        multiline
        error={errors.description}
      />
      {/* D134: off by default; the only thing you can change after posting. */}
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Show my username as the creator"
        accessibilityState={{ checked: showCreator }}
        onPress={() => setShowCreator(!showCreator)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.md,
          paddingVertical: SPACE.sm,
          marginBottom: SPACE.sm,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontWeight: '700' }}>Show my username as the creator</Text>
          <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
            You can turn this off later. The title and description can’t be changed after posting;
            you can delete the topic.
          </Text>
        </View>
        <Switch {...switchColors} value={showCreator} onValueChange={setShowCreator} />
      </Pressable>
      <Button title="Start topic" onPress={() => void submit()} busy={busy} />
    </Screen>
  );
}
