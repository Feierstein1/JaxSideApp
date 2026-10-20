import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  REPORT_DETAILS_MAX,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
  type ReportTarget,
  DARK,
} from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { getFreshReading } from '@/location/device';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { Banner, Button, Field, FormError, Sheet } from '@/ui';
import { Text } from '@/text';
import { ensureGuide } from '@/guides/guide';

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
  /** D104: the first report shows its guide before the sheet opens; closing it cancels. */
  const [ready, setReady] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!target) return setReady(false);
    let live = true;
    void ensureGuide('report').then((ok) => {
      if (!live) return;
      if (ok) setReady(true);
      else closeRef.current();
    });
    return () => {
      live = false;
    };
  }, [target]);

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
    <Sheet open={!!target && ready} onClose={close} title={sent ? undefined : 'Report'}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: SPACE.sm, gap: 6 }}
        keyboardShouldPersistTaps="handled"
      >
        {sent ? (
          <View style={{ alignItems: 'center', gap: SPACE.sm, paddingTop: SPACE.lg }}>
            <Ionicons name="checkmark-circle" size={56} color={DARK.accent} />
            <Text accessibilityRole="header" style={[TYPE.title, { textAlign: 'center' }]}>
              Thanks for reporting
            </Text>
            <Text style={[TYPE.callout, { color: DARK.textMuted, textAlign: 'center' }]}>
              A moderator will review it. You can follow its status in Account → My reports. You can
              also block this person from their profile.
            </Text>
            <Button title="Done" onPress={close} style={{ alignSelf: 'stretch' }} />
          </View>
        ) : (
          <>
            <Text style={[TYPE.callout, { color: DARK.textMuted, marginBottom: 6 }]}>
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
                    borderColor: active ? DARK.tealText : DARK.raised,
                    backgroundColor: active || pressed ? DARK.tealSoft : DARK.raised,
                  })}
                >
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={active ? DARK.tealText : DARK.textMuted}
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
