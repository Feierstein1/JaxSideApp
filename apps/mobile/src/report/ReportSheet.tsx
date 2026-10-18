import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { Banner, Button, Field, FormError, Sheet } from '@/ui';

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
    <Sheet open={!!target} onClose={close} title={sent ? undefined : 'Report'}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: SPACE.sm, gap: 6 }}
        keyboardShouldPersistTaps="handled"
      >
        {sent ? (
          <View style={{ alignItems: 'center', gap: SPACE.sm, paddingTop: SPACE.lg }}>
            <Ionicons name="checkmark-circle" size={56} color={COLORS.primary} />
            <Text accessibilityRole="header" style={[TYPE.title, { textAlign: 'center' }]}>
              Thanks for reporting
            </Text>
            <Text style={[TYPE.callout, { color: COLORS.textMuted, textAlign: 'center' }]}>
              A moderator will review it. You can follow its status in Account → Settings → My
              reports. You can also block this person from their profile.
            </Text>
            <Button title="Done" onPress={close} style={{ alignSelf: 'stretch' }} />
          </View>
        ) : (
          <>
            <Text style={[TYPE.callout, { color: COLORS.textMuted, marginBottom: 6 }]}>
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
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: SPACE.md,
                    minHeight: 48,
                    paddingHorizontal: SPACE.md,
                    borderRadius: RADIUS.md,
                    borderWidth: 1,
                    borderColor: active ? COLORS.primary : COLORS.cardBorder,
                    backgroundColor: active || pressed ? COLORS.primarySoft : COLORS.background,
                  })}
                >
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={active ? COLORS.primary : COLORS.border}
                  />
                  <Text style={[TYPE.body, { flex: 1 }, active && { fontWeight: '700' }]}>
                    {REPORT_REASON_LABELS[r]}
                  </Text>
                </Pressable>
              );
            })}
            {reason === 'CHILD_SAFETY' ? (
              <Banner icon="call-outline" style={{ marginTop: 6, marginBottom: 0 }}>
                If a child is in immediate danger, call 911.
              </Banner>
            ) : null}
            <View style={{ marginTop: SPACE.md }}>
              <Field
                label="Details (optional)"
                value={details}
                onChangeText={setDetails}
                maxLength={REPORT_DETAILS_MAX}
                multiline
                placeholder="Anything that helps a moderator understand"
                style={{ minHeight: 76, textAlignVertical: 'top' }}
              />
            </View>
            {error ? <FormError>{error}</FormError> : null}
            <Button
              title="Send report"
              onPress={() => void submit()}
              busy={busy}
              disabled={!reason}
              style={{ marginTop: 0 }}
            />
            <Button variant="link" title="Cancel" onPress={close} />
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}
