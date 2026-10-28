import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { DARK, POLL_TOPICS, type PollTopic, type PollView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useGuest } from '@/auth/guest';
import { DecoBox, StepEdge } from '@/deco';
import { showAlert } from '@/dialog';
import { fetchPolls, pollWhen } from '@/polls/api';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { Chip, ErrorState, FloatingButton, PageTitle, SearchField, Segmented } from '@/ui';

const TOPICS = Object.keys(POLL_TOPICS) as PollTopic[];

/** One poll in the list: what it's about and where you stand. */
function PollRow({ p }: { p: PollView }) {
  const open = p.status === 'open';
  const voted = p.myChoiceIds.length > 0;
  const status = open
    ? voted
      ? `You voted · ${p.results?.voters ?? 0} so far`
      : p.canVote
        ? 'Vote to see the results'
        : 'Open'
    : `${p.results?.voters ?? 0} voters · results`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${POLL_TOPICS[p.topic]} poll: ${p.question}. ${status}. ${pollWhen(p)}`}
      onPress={() => router.push(`/citywide/poll/${p.id}`)}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <DecoBox
        shape="chamfer"
        fill={DARK.card}
        stroke={open && p.canVote ? DARK.accent : undefined}
        style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.md }}
      >
        <Ionicons
          name={open ? (voted ? 'checkmark-circle' : 'checkbox-outline') : 'stats-chart'}
          size={20}
          color={DARK.accent}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[TYPE.caption, { color: DARK.accent, fontWeight: '700' }]}>
            {p.featured && open ? '★ POLL OF THE WEEK · ' : ''}
            {POLL_TOPICS[p.topic]}
          </Text>
          <Text style={{ fontWeight: '700' }} numberOfLines={2}>
            {p.question}
          </Text>
          <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
            {status} · {pollWhen(p)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={DARK.textMuted} />
      </DecoBox>
    </Pressable>
  );
}

/**
 * D123 / D133 / D150: polls. On black: Open / Voted, then search and topic filters; on grey
 * the list (the Poll of the week first), and + to suggest a poll question. Open is what you
 * haven't answered yet; Voted is what you answered plus closed polls with their results
 * (once a poll closes, who voted is forgotten, so closed ones are there for everyone).
 */
export default function PollsScreen() {
  const { state } = useAuth();
  const { isGuest, promptAccount } = useGuest();
  const [polls, setPolls] = useState<PollView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState<PollTopic | undefined>(undefined);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'open' | 'voted'>('open');

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetchPolls(topic);
      setPolls([...r.open, ...r.closed]);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load polls.');
    }
  }, [topic]);
  useEffect(() => {
    setPolls(null);
  }, [topic]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase();
    const inTab = (p: PollView) =>
      tab === 'open'
        ? p.status === 'open' && p.myChoiceIds.length === 0
        : p.status !== 'open' || p.myChoiceIds.length > 0;
    return (polls ?? [])
      .filter((p) => inTab(p) && (!words || p.question.toLowerCase().includes(words)))
      .sort((a, b) => Number(b.featured) - Number(a.featured)); // stable: keeps the order
  }, [polls, q, tab]);

  function suggest() {
    if (isGuest) return promptAccount('suggest poll questions');
    if (state.status === 'signedIn' && !state.user.emailVerified) {
      showAlert('Confirm your email first', 'Enter the 6-digit code from your email in Account.');
      return;
    }
    router.push('/citywide/suggest-poll');
  }

  return (
    <View style={{ flex: 1, backgroundColor: DARK.page }}>
      <View style={{ backgroundColor: DARK.bar, paddingHorizontal: 12, paddingTop: 6, gap: 8 }}>
        <PageTitle
          icon="stats-chart"
          title="Polls"
          subtitle="Vote to see how Jacksonville answered."
        />
        {/* D150: what's left to answer, or what you answered (and every result). */}
        <Segmented
          stretch
          options={[
            { key: 'open', label: 'Open polls', icon: 'checkbox-outline' },
            { key: 'voted', label: 'Voted', icon: 'stats-chart' },
          ]}
          value={tab}
          onChange={(v) => setTab(v as 'open' | 'voted')}
        />
        <View style={{ flexDirection: 'row' }}>
          <SearchField
            compact
            label="Search polls"
            placeholder="Search poll questions"
            value={q}
            onChangeText={setQ}
            maxLength={60}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: SPACE.sm, alignItems: 'center', paddingBottom: 8 }}
        >
          <Chip label="All" active={!topic} onPress={() => setTopic(undefined)} />
          {TOPICS.map((t) => (
            <Chip
              key={t}
              label={POLL_TOPICS[t]}
              active={topic === t}
              onPress={() => setTopic(topic === t ? undefined : t)}
            />
          ))}
        </ScrollView>
      </View>
      <StepEdge />
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!polls && !error ? (
        <ActivityIndicator color={DARK.accent} style={{ marginTop: SPACE.lg }} />
      ) : null}
      {polls ? (
        <FlatList
          data={shown}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 110, gap: SPACE.sm }}
          renderItem={({ item }) => <PollRow p={item} />}
          ListEmptyComponent={
            <Text style={[TYPE.callout, { color: DARK.textMuted, textAlign: 'center' }]}>
              {q.trim() || topic
                ? 'No polls match.'
                : tab === 'open'
                  ? 'You’re all caught up. New polls come out every week.'
                  : 'Polls you answer, and results of closed polls, show here.'}
            </Text>
          }
        />
      ) : null}
      <FloatingButton label="Suggest a poll question" onPress={suggest} />
    </View>
  );
}
