import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { DARK, type GiveawayWinView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { haptic } from '@/motion';
import { social } from '@/social/api';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { Banner, Button, Card, ErrorState, PageTitle, Screen } from '@/ui';

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/**
 * D188: you won a giveaway. Accept to have the prize sent to the email on your account
 * (shown masked so you can check it), or decline. Only until the deadline.
 */
export default function GiveawayWin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [win, setWin] = useState<GiveawayWinView | null>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<'yes' | 'no'>();

  const load = useCallback(() => {
    social
      .wins()
      .then((r) => setWin(r.wins.find((w) => w.id === id) ?? null))
      .catch((e: unknown) => setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load.'));
  }, [id]);
  useFocusEffect(load);

  async function answer(accept: boolean) {
    setBusy(accept ? 'yes' : 'no');
    setError(undefined);
    try {
      await social.answerWin(id, accept);
      if (accept) haptic.success();
      load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t send your answer.');
    } finally {
      setBusy(undefined);
    }
  }

  if (win === undefined) {
    return error ? (
      <ErrorState message={error} onRetry={load} />
    ) : (
      <ActivityIndicator style={{ marginTop: 32 }} color={DARK.accent} />
    );
  }
  if (win === null) return <ErrorState message="This prize wasn’t found." />;

  const open = win.status === 'NOTIFIED' && new Date(win.respondBy) > new Date();
  return (
    <Screen>
      <PageTitle title="You won!" subtitle={win.title} icon="gift-outline" />
      <Card style={{ alignItems: 'center', gap: SPACE.sm }}>
        <Ionicons name="gift" size={44} color={DARK.accent} />
        <Text style={[TYPE.caption, { color: DARK.textMuted }]}>Your prize</Text>
        <Text style={{ fontSize: 20, fontWeight: '800', textAlign: 'center' }}>{win.prize}</Text>
      </Card>

      {open ? (
        <View style={{ gap: SPACE.md, marginTop: SPACE.lg }}>
          <Text>
            We send prizes by email to the address on your account
            {win.maskedEmail ? ': ' : '.'}
            {win.maskedEmail ? <Text style={{ fontWeight: '800' }}>{win.maskedEmail}</Text> : null}
          </Text>
          <Text style={{ color: DARK.textMuted }}>
            If that isn’t right, change it first in Account → Change email. Please answer by{' '}
            {dateTime(win.respondBy)}.
          </Text>
          {error ? (
            <Banner tone="error" icon="alert-circle">
              {error}
            </Banner>
          ) : null}
          <Button
            title="Yes, send my prize"
            icon="checkmark-circle"
            busy={busy === 'yes'}
            disabled={!!busy}
            onPress={() => void answer(true)}
          />
          <Button
            title="No thanks"
            variant="secondary"
            busy={busy === 'no'}
            disabled={!!busy}
            onPress={() => void answer(false)}
          />
        </View>
      ) : (
        <View style={{ marginTop: SPACE.lg, gap: SPACE.md }}>
          <Banner
            tone={win.status === 'ACCEPTED' || win.status === 'PRIZE_SENT' ? 'success' : 'info'}
            icon={win.status === 'PRIZE_SENT' ? 'mail' : 'information-circle'}
          >
            {win.status === 'ACCEPTED'
              ? 'Thanks! Your prize will be emailed to you soon.'
              : win.status === 'PRIZE_SENT'
                ? 'Your prize was sent to your email. Check your inbox (and spam folder).'
                : win.status === 'DECLINED'
                  ? 'You turned this prize down.'
                  : 'This prize can no longer be claimed.'}
          </Banner>
          <Button variant="link" title="Back to notifications" onPress={() => router.back()} />
        </View>
      )}
    </Screen>
  );
}
