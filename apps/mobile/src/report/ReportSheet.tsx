import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  COLORS,
  REPORT_DETAILS_MAX,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
  type ReportTarget,
} from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { getFreshReading } from '@/location/device';
import { Button, styles } from '@/ui';

/**
 * P5.1: report a post, comment or profile. Pick a reason, optionally add details.
 * Reports go to moderators; the person reported isn't told who reported them.
 */
export function ReportSheet({
  target,
  onClose,
}: {
  target: ReportTarget | undefined;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason>();
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);

  function close() {
    setReason(undefined);
    setDetails('');
    setError(undefined);
    setSent(false);
    onClose();
  }

  async function submit() {
    if (!target || !reason) return;
    setBusy(true);
    setError(undefined);
    try {
      const reading = await getFreshReading();
      await api.post('/api/v1/reports', {
        reading,
        target,
        reason,
        ...(details.trim() ? { details: details.trim() } : {}),
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t send your report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={!!target} animationType="slide" transparent onRequestClose={close}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: COLORS.scrim }}>
        <View
          style={{
            backgroundColor: COLORS.background,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: '85%',
          }}
        >
          <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
            {sent ? (
              <>
                <Text style={styles.title}>Thanks for reporting</Text>
                <Text style={styles.body}>
                  A moderator will review it. You can follow its status in Account → Settings → My
                  reports. You can also block this person from their profile.
                </Text>
                <Button title="Done" onPress={close} />
              </>
            ) : (
              <>
                <Text style={styles.title}>Report</Text>
                <Text style={[styles.muted, { marginBottom: 8 }]}>
                  What’s wrong? The person won’t be told who reported them.
                </Text>
                {REPORT_REASONS.map((r) => {
                  const active = reason === r;
                  return (
                    <Pressable
                      key={r}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      onPress={() => setReason(r)}
                      style={{
                        paddingVertical: 11,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        marginBottom: 4,
                        borderWidth: 1,
                        borderColor: active ? COLORS.primary : COLORS.cardBorder,
                        backgroundColor: active ? COLORS.primarySoft : COLORS.background,
                      }}
                    >
                      <Text style={[styles.body, active && { fontWeight: '700' }]}>
                        {REPORT_REASON_LABELS[r]}
                      </Text>
                    </Pressable>
                  );
                })}
                <Text style={[styles.label, { marginTop: 8 }]}>Details (optional)</Text>
                <TextInput
                  accessibilityLabel="Report details"
                  value={details}
                  onChangeText={setDetails}
                  maxLength={REPORT_DETAILS_MAX}
                  multiline
                  placeholder="Anything that helps a moderator understand"
                  placeholderTextColor={COLORS.placeholder}
                  style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
                />
                {reason === 'CHILD_SAFETY' ? (
                  <Text style={[styles.body, styles.banner, { marginTop: 8 }]}>
                    If a child is in immediate danger, call 911.
                  </Text>
                ) : null}
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button title="Send report" onPress={() => void submit()} busy={busy} />
                <Button variant="link" title="Cancel" onPress={close} />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
