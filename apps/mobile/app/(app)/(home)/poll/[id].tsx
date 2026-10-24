import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { DARK, POLL_TOPICS, type PollView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useGuest } from '@/auth/guest';
import { showAlert } from '@/dialog';
import { haptic } from '@/motion';
import { answerLabel, fetchPoll, pollWhen, votePoll } from '@/polls/api';
import { PollResults } from '@/polls/PollResults';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { Button, ErrorState, PageTitle, Screen } from '@/ui';

type Choice = PollView['choices'][number];

/** One answer row: a radio (one answer) or a checkbox (Pick several). */
function AnswerRow({
  label,
  on,
  multi,
  disabled,
  onPress,
}: {
  label: string;
  on: boolean;
  multi: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: on, disabled }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
        padding: SPACE.md,
        borderRadius: RADIUS.lg,
        backgroundColor: on ? DARK.tealSoft : DARK.card,
        borderWidth: 1.5,
        borderColor: on ? DARK.accent : DARK.hairline,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Ionicons
        name={
          multi ? (on ? 'checkbox' : 'square-outline') : on ? 'radio-button-on' : 'radio-button-off'
        }
        size={22}
        color={on ? DARK.accent : DARK.textMuted}
      />
      <Text style={{ flex: 1, fontSize: 16, fontWeight: on ? '800' : '600' }}>{label}</Text>
    </Pressable>
  );
}

/** Yes / No as two big buttons side by side, "Not sure" under them. */
function YesNo({
  poll,
  picked,
  pick,
}: {
  poll: PollView;
  picked: string[];
  pick: (c: Choice) => void;
}) {
  const [yes, no, ...rest] = poll.choices;
  const big = (c: Choice | undefined, icon: 'thumbs-up' | 'thumbs-down') => {
    if (!c) return null;
    const on = picked.includes(c.id);
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        onPress={() => pick(c)}
        style={{
          flex: 1,
          alignItems: 'center',
          gap: 8,
          paddingVertical: SPACE.xl,
          borderRadius: RADIUS.lg,
          backgroundColor: on ? DARK.tealSoft : DARK.card,
          borderWidth: 1.5,
          borderColor: on ? DARK.accent : DARK.hairline,
        }}
      >
        <Ionicons
          name={on ? icon : (`${icon}-outline` as const)}
          size={28}
          color={on ? DARK.accent : DARK.text}
        />
        <Text style={{ fontSize: 18, fontWeight: '800' }}>{c.label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ gap: SPACE.sm }}>
      <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
        {big(yes, 'thumbs-up')}
        {big(no, 'thumbs-down')}
      </View>
      {rest.map((c) => (
        <AnswerRow
          key={c.id}
          label={c.label}
          multi={false}
          on={picked.includes(c.id)}
          onPress={() => pick(c)}
        />
      ))}
    </View>
  );
}

/** A 1–5 rating: five buttons in a row, with the words for each end under them. */
function Rating({
  poll,
  picked,
  pick,
}: {
  poll: PollView;
  picked: string[];
  pick: (c: Choice) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
        {poll.choices.map((c) => {
          const on = picked.includes(c.id);
          return (
            <Pressable
              key={c.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={answerLabel(poll, c)}
              onPress={() => pick(c)}
              style={{
                flex: 1,
                aspectRatio: 1,
                maxHeight: 64,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: RADIUS.lg,
                backgroundColor: on ? DARK.accent : DARK.card,
                borderWidth: 1.5,
                borderColor: on ? DARK.accent : DARK.hairline,
              }}
            >
              <Text
                style={{ fontSize: 20, fontWeight: '800', color: on ? DARK.onAccent : DARK.text }}
              >
                {c.value ?? c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {poll.scale ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.md }}>
          <Text style={[TYPE.caption, { color: DARK.textMuted }]}>{poll.scale.low}</Text>
          <Text style={[TYPE.caption, { color: DARK.textMuted, textAlign: 'right' }]}>
            {poll.scale.high}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * D123 / D124: one poll. Open: answer it (Yes / No, pick one, pick several, or rate 1–5) and
 * vote (once, final; accounts only, from inside Duval). After voting you see your answers;
 * totals appear when the poll closes.
 */
export default function PollScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const { isGuest, promptAccount } = useGuest();
  const [poll, setPoll] = useState<PollView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
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
  const multi = poll.kind === 'multi';
  const most = multi ? (poll.maxPicks ?? poll.choices.length) : 1;
  const mine = poll.choices.filter((c) => poll.myChoiceIds.includes(c.id));
  const verified = state.status === 'signedIn' && state.user.emailVerified;

  function pick(c: Choice) {
    if (!multi) return setPicked([c.id]);
    if (picked.includes(c.id)) return setPicked(picked.filter((x) => x !== c.id));
    if (picked.length < most) setPicked([...picked, c.id]);
  }

  function confirmVote() {
    if (isGuest) return promptAccount('vote in polls');
    if (!verified) {
      showAlert('Confirm your email first', 'Enter the 6-digit code from your email in Account.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Go to Account', onPress: () => router.push('/account') },
      ]);
      return;
    }
    const answers = poll!.choices.filter((c) => picked.includes(c.id));
    if (!answers.length) return;
    showAlert(
      `Vote “${answers.map((c) => answerLabel(poll!, c)).join('”, “')}”?`,
      'Your vote is final. It stays anonymous: once the poll closes, no one can tell how you voted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Vote', onPress: () => void send(answers.map((c) => c.id)) },
      ],
      { icon: 'checkbox-outline', tone: 'info' },
    );
  }

  async function send(choiceIds: string[]) {
    setBusy(true);
    try {
      setPoll(await votePoll(poll!.id, choiceIds));
      haptic.success();
    } catch (e) {
      showAlert(
        'Couldn’t vote',
        e instanceof ApiRequestError ? e.message : 'Try again.',
        undefined,
        { icon: 'cloud-offline-outline', tone: 'danger' },
      );
      if (e instanceof ApiRequestError && e.code === 'POLL_CLOSED') void load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text
        style={[
          TYPE.caption,
          { color: DARK.accent, fontWeight: '800', letterSpacing: 0.6, marginBottom: 6 },
        ]}
      >
        {POLL_TOPICS[poll.topic].toUpperCase()}
      </Text>
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

      {open && mine.length ? (
        <View
          style={{ backgroundColor: DARK.card, borderRadius: RADIUS.lg, padding: SPACE.lg, gap: 6 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="checkmark-circle" size={20} color={DARK.accent} />
            <Text style={{ flex: 1, fontWeight: '800' }}>
              You voted “{mine.map((c) => answerLabel(poll, c)).join('”, “')}”
            </Text>
          </View>
          <Text style={[TYPE.callout, { color: DARK.textMuted }]}>
            Results appear here when the poll closes. Until then, nobody can see the totals.
          </Text>
        </View>
      ) : null}

      {open && !mine.length ? (
        <View style={{ gap: SPACE.sm }}>
          {multi ? (
            <Text style={[TYPE.callout, { color: DARK.textMuted }]}>
              {poll.maxPicks ? `Pick up to ${poll.maxPicks}.` : 'Pick all that apply.'}
            </Text>
          ) : null}
          {poll.kind === 'yes_no' ? (
            <YesNo poll={poll} picked={picked} pick={pick} />
          ) : poll.kind === 'scale' ? (
            <Rating poll={poll} picked={picked} pick={pick} />
          ) : (
            poll.choices.map((c) => (
              <AnswerRow
                key={c.id}
                label={c.label}
                multi={multi}
                on={picked.includes(c.id)}
                disabled={multi && !picked.includes(c.id) && picked.length >= most}
                onPress={() => pick(c)}
              />
            ))
          )}
          <Button
            title={isGuest ? 'Create an account to vote' : 'Vote'}
            onPress={confirmVote}
            busy={busy}
            disabled={!isGuest && !picked.length}
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
