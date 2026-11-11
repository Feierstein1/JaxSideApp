import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AD_REPORT_REASONS,
  CONTENT_REPORT_REASONS,
  EVENT_REPORT_REASONS,
  REPORT_DETAILS_MAX,
  REPORT_REASON_LABELS,
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

/** D209: before reporting an ad, what ads may be reported for and what isn't a reason. */
const AD_DO = [
  'It uses AI-made food or drink photos instead of the real thing',
  'It’s an over-the-top AI flyer or image',
  'The offer is false or misleading',
  'It’s a scam, sexual or hateful',
];
const AD_DONT = [
  'Report an ad just because you don’t like it (tap Not interested instead)',
  'Report a business you compete with or have a grudge against',
  'Report the same ad again and again',
];

function Rule({ ok, text }: { ok: boolean; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'flex-start' }}>
      <Ionicons
        name={ok ? 'checkmark-circle' : 'close-circle'}
        size={20}
        color={ok ? DARK.tealText : DARK.textMuted}
        style={{ marginTop: 1 }}
      />
      <Text style={[TYPE.body, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

/**
 * P5.1: report a post, comment or profile. Pick a reason, optionally add details.
 * Reports go to moderators; the person reported isn't told who reported them.
 * D209: an ad first shows what to report (and what not to), then only the ad reasons.
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
  const isAd = target?.type === 'ad';
  /** D209: the Do / Don't step, every time an ad is reported. */
  const [rulesRead, setRulesRead] = useState(false);
  // D230: events have their own reasons too.
  const reasons: readonly ReportReason[] = isAd
    ? AD_REPORT_REASONS
    : target?.type === 'event'
      ? EVENT_REPORT_REASONS
      : CONTENT_REPORT_REASONS;
  /** D104: the first report shows its guide before the sheet opens; closing it cancels. */
  const [ready, setReady] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!target) return setReady(false);
    // D209: an ad shows its own Do / Don't step instead of the first-report guide.
    if (target.type === 'ad') return setReady(true);
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
    setRulesRead(false);
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
    <Sheet
      open={!!target && ready}
      onClose={close}
      title={sent ? undefined : isAd ? 'Report this ad' : 'Report'}
    >
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
              {isAd
                ? 'A moderator will review it. You can follow its status in Account → My reports.'
                : 'A moderator will review it. You can follow its status in Account → My reports. You can also block this person from their profile.'}
            </Text>
            <Button title="Done" onPress={close} style={{ alignSelf: 'stretch' }} />
          </View>
        ) : isAd && !rulesRead ? (
          <View style={{ gap: SPACE.sm }}>
            <Text style={[TYPE.headline]}>Report an ad when</Text>
            {AD_DO.map((t) => (
              <Rule key={t} ok text={t} />
            ))}
            <Text style={[TYPE.headline, { marginTop: SPACE.sm }]}>Please don’t</Text>
            {AD_DONT.map((t) => (
              <Rule key={t} ok={false} text={t} />
            ))}
            <Text style={[TYPE.callout, { color: DARK.textMuted, marginTop: SPACE.xs }]}>
              A person at JaxSide reviews every report. Repeated false reports can lead to a strike.
            </Text>
            <Button title="I understand" onPress={() => setRulesRead(true)} />
            <Button variant="link" title="Cancel" onPress={close} />
          </View>
        ) : (
          <>
            <Text style={[TYPE.callout, { color: DARK.textMuted, marginBottom: 6 }]}>
              {isAd
                ? 'What’s wrong with this ad? The business won’t be told who reported it.'
                : 'What’s wrong? The person won’t be told who reported them.'}
            </Text>
            {reasons.map((r) => {
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
