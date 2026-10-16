import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { APPEAL_MAX, COLORS } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { Button, styles } from '@/ui';

export interface Strike {
  id: string;
  action: 'WARN' | 'SUSPEND' | 'BAN';
  reason: string;
  createdAt: string;
  until: string | null;
  countsUntil: string | null;
  appeal: {
    status: 'OPEN' | 'ACCEPTED' | 'REJECTED';
    createdAt: string;
    decisionNote: string | null;
    decidedAt: string | null;
  } | null;
  canAppeal: boolean;
  appealBlockedReason: string | null;
}

export interface Standing {
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  strikes: Strike[];
}

const LABEL: Record<Strike['action'], string> = {
  WARN: 'Warning',
  SUSPEND: 'Suspension',
  BAN: 'Ban',
};
const APPEAL_STATUS = {
  OPEN: 'Appeal sent: waiting for review',
  ACCEPTED: 'Appeal accepted',
  REJECTED: 'Appeal not accepted',
} as const;
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** P5.6 / P5.7: strikes with their reasons, appeal status, and an appeal form. */
export function StrikeList({
  strikes,
  onAppeal,
}: {
  strikes: Strike[];
  /** Sends the appeal; the list reloads afterwards. */
  onAppeal: (strikeId: string, message: string) => Promise<void>;
}) {
  return (
    <View>
      {strikes.map((s) => (
        <StrikeRow key={s.id} s={s} onAppeal={onAppeal} />
      ))}
    </View>
  );
}

function StrikeRow({
  s,
  onAppeal,
}: {
  s: Strike;
  onAppeal: (strikeId: string, message: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function send() {
    setBusy(true);
    setError(undefined);
    try {
      await onAppeal(s.id, message.trim());
      setOpen(false);
      setMessage('');
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t send your appeal.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder }}
    >
      <Text style={[styles.label, { marginBottom: 2 }]}>
        {LABEL[s.action]} · {shortDate(s.createdAt)}
      </Text>
      <Text style={styles.body}>{s.reason}</Text>
      <Text style={styles.muted}>
        {s.until ? `Suspended until ${shortDate(s.until)}. ` : ''}
        {s.countsUntil ? `Counts until ${shortDate(s.countsUntil)}.` : ''}
      </Text>
      {s.appeal ? (
        <Text style={[styles.body, { marginTop: 4, fontWeight: '600' }]}>
          {APPEAL_STATUS[s.appeal.status]}
          {s.appeal.decisionNote ? `: ${s.appeal.decisionNote}` : ''}
        </Text>
      ) : null}
      {s.canAppeal && !open ? (
        <Button variant="link" title="Appeal this" onPress={() => setOpen(true)} />
      ) : null}
      {!s.canAppeal && s.appealBlockedReason && s.appeal?.status !== 'OPEN' ? (
        <Text style={styles.muted}>{s.appealBlockedReason}</Text>
      ) : null}
      {open ? (
        <View style={{ marginTop: 8 }}>
          <Text style={styles.label}>Why should this be reconsidered?</Text>
          <TextInput
            accessibilityLabel="Your appeal"
            value={message}
            onChangeText={setMessage}
            maxLength={APPEAL_MAX}
            multiline
            placeholder="Explain what happened. A moderator will read it."
            placeholderTextColor={COLORS.placeholder}
            style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Send appeal" onPress={() => void send()} busy={busy} />
          <Button variant="link" title="Cancel" onPress={() => setOpen(false)} />
        </View>
      ) : null}
    </View>
  );
}
