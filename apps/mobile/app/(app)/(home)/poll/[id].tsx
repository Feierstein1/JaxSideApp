import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { DARK, type PollView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useGuest } from '@/auth/guest';
import { showAlert } from '@/dialog';
import { haptic } from '@/motion';
import { fetchPoll, pollWhen, votePoll } from '@/polls/api';
import { PollResults } from '@/polls/PollResults';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { Button, ErrorState, PageTitle, Screen } from '@/ui';

/**
 * D123: one poll. Open: pick a choice and vote (once, final; accounts only, from inside
 * Duval). After voting you see your choice; totals appear when the poll closes.
 */
export default function PollScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const { isGuest, promptAccount } = useGuest();
  const [poll, setPoll] = useState<PollView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPoll(await fetchPoll(id));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load this poll.');
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!poll) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: DARK.page,
        }}
      >
        <ActivityIndicator color={DARK.accent} />
      </View>
    );
  }

  const open = poll.status === 'open';
  const mine = poll.choices.find((c) => c.id === poll.myChoiceId);
  const verified = state.status === 'signedIn' && state.user.emailVerified;

  function confirmVote() {
    if (isGuest) return promptAccount('vote in polls');
    if (!verified) {
      showAlert('Confirm your email first', 'Enter the 6-digit code from your email in Account.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Go to Account', onPress: () => router.push('/account') },
      ]);
      return;
    }
    const choice = poll!.choices.find((c) => c.id === picked);
    if (!choice) return;
    showAlert(
      `Vote “${choice.label}”?`,
      'Your vote is final. It stays anonymous: once the poll closes, no one can tell how you voted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Vote', onPress: () => void send(choice.id) },
      ],
      { icon: 'checkbox-outline', tone: 'info' },
    );
  }

  async function send(choiceId: string) {
    setBusy(true);
    try {
      setPoll(await votePoll(poll!.id, choiceId));
      haptic.success();
    } catch (e) {
      showAlert(
        'Couldn’t vote',
        e instanceof ApiRequestError ? e.message : 'Try again.',
        undefined,
        {
          icon: 'cloud-offline-outline',
          tone: 'danger',
        },
      );
      if (e instanceof ApiRequestError && e.code === 'POLL_CLOSED') void load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <PageTitle
        icon={open ? 'checkbox-outline' : 'stats-chart'}
        title={poll.question}
        subtitle={poll.details ?? undefined}
      />
      <Text
        style={[
          TYPE.caption,
          { color: DARK.textMuted, marginTop: -SPACE.md, marginBottom: SPACE.lg },
        ]}
      >
        {pollWhen(poll)}
      </Text>

      {open && mine ? (
        <View
          style={{ backgroundColor: DARK.card, borderRadius: RADIUS.lg, padding: SPACE.lg, gap: 6 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="checkmark-circle" size={20} color={DARK.accent} />
            <Text style={{ fontWeight: '800' }}>You voted “{mine.label}”</Text>
          </View>
          <Text style={[TYPE.callout, { color: DARK.textMuted }]}>
            Results appear here when the poll closes. Until then, nobody can see the totals.
          </Text>
        </View>
      ) : null}

      {open && !mine ? (
        <View style={{ gap: SPACE.sm }}>
          {poll.choices.map((c) => {
            const on = picked === c.id;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setPicked(c.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACE.md,
                  padding: SPACE.md,
                  borderRadius: RADIUS.lg,
                  backgroundColor: on ? DARK.tealSoft : DARK.card,
                  borderWidth: 1.5,
                  borderColor: on ? DARK.accent : DARK.hairline,
                }}
              >
                <Ionicons
                  name={on ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={on ? DARK.accent : DARK.textMuted}
                />
                <Text style={{ flex: 1, fontSize: 16, fontWeight: on ? '800' : '600' }}>
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
          <Button
            title={isGuest ? 'Create an account to vote' : 'Vote'}
            onPress={confirmVote}
            busy={busy}
            disabled={!isGuest && !picked}
            style={{ marginTop: SPACE.md }}
          />
          <Text style={[TYPE.caption, { color: DARK.textMuted, textAlign: 'center' }]}>
            One vote per person, from inside Duval County. Results show when the poll closes.
          </Text>
        </View>
      ) : null}

      {poll.status === 'closed' ? <PollResults poll={poll} /> : null}

      <Button
        variant="link"
        title="Past polls"
        onPress={() => router.push('/polls')}
        style={{ marginTop: SPACE.xl }}
      />
    </Screen>
  );
}
