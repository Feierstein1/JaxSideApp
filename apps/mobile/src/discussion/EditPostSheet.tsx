import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { DARK, POST_MAX, type DiscussionKind } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { showAlert } from '@/dialog';
import { haptic } from '@/motion';
import { TextInput } from '@/text';
import { RADIUS, SPACE } from '@/tokens';
import { Button, Sheet } from '@/ui';
import { editPost, markFeedsDirty } from './api';
import { sendScreened } from './screening';

/**
 * P3.8 / D105 / D115: edit your own post's text, from the post page or your profile's list.
 * Works from anywhere (the server doesn't need you near your own post to edit it).
 */
export function EditPostSheet({
  post,
  onClose,
  onSaved,
}: {
  post: { kind: DiscussionKind; id: string; body: string } | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (post) setText(post.body);
  }, [post]);

  async function save() {
    if (!post || !text.trim() || saving) return;
    setSaving(true);
    try {
      const sent = await sendScreened((ok) => editPost(post.kind, post.id, text.trim(), ok));
      if (!sent) return;
      haptic.success();
      markFeedsDirty();
      onSaved();
      onClose();
    } catch (e) {
      showAlert(
        'Couldn’t save',
        e instanceof ApiRequestError ? e.message : 'Try again.',
        undefined,
        {
          icon: 'alert-circle-outline',
          tone: 'warning',
        },
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!post} onClose={onClose} title="Edit post">
      <View style={{ paddingHorizontal: 20, paddingBottom: SPACE.sm, gap: SPACE.sm }}>
        <TextInput
          accessibilityLabel="Post text"
          value={text}
          onChangeText={setText}
          maxLength={POST_MAX}
          multiline
          autoFocus
          textAlignVertical="top"
          style={{
            minHeight: 120,
            maxHeight: 260,
            borderRadius: RADIUS.md,
            borderWidth: 1,
            borderColor: DARK.border,
            padding: SPACE.md,
            fontSize: 16,
            backgroundColor: DARK.raised,
          }}
        />
        <Button title="Save" busy={saving} disabled={!text.trim()} onPress={() => void save()} />
      </View>
    </Sheet>
  );
}
