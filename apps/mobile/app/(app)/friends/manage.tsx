import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { COLORS, type FriendRequestView, type FriendView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { timeAgo } from '@/format';
import { social } from '@/social/api';
import { FriendRow } from '@/social/FriendRow';
import { refreshUnread } from '@/social/unread';
import { Button, Field, styles } from '@/ui';

/** D76: add a friend by username, answer requests, and see or remove friends. */
export default function ManageFriends() {
  const [friends, setFriends] = useState<FriendView[]>();
  const [incoming, setIncoming] = useState<FriendRequestView[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestView[]>([]);
  const [name, setName] = useState('');
  const [note, setNote] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [f, r] = await Promise.all([social.friends(), social.requests()]);
      setFriends(f.friends);
      setIncoming(r.incoming);
      setOutgoing(r.outgoing);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load.');
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function run(action: () => Promise<unknown>) {
    setError(undefined);
    try {
      await action();
      await load();
      void refreshUnread();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Something went wrong.');
    }
  }

  async function send() {
    const username = name.trim().replace(/^@/, '');
    if (!username) return;
    setBusy(true);
    setNote(undefined);
    await run(async () => {
      const r = await social.send(username);
      setNote(
        r.state === 'friends'
          ? `You and ${username} are now friends.`
          : `Request sent to ${username}.`,
      );
      setName('');
    });
    setBusy(false);
  }

  function remove(f: FriendView) {
    Alert.alert(`Remove ${f.username}?`, 'You can send a new request later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void run(() => social.unfriend(f.username)),
      },
    ]);
  }

  if (!friends) {
    return error ? (
      <Text style={[styles.screen, styles.error]}>{error}</Text>
    ) : (
      <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.primary} />
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Field
        label="Add a friend by username"
        value={name}
        onChangeText={setName}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={21}
        placeholder="username"
      />
      <Button title="Send request" busy={busy} onPress={() => void send()} />
      {note ? <Text style={[styles.body, { marginTop: 6 }]}>{note}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {incoming.length ? (
        <Text style={[styles.label, { marginTop: 20 }]}>Requests for you</Text>
      ) : null}
      {incoming.map((r) => (
        <FriendRow key={r.id} user={r.user} subtitle={timeAgo(r.createdAt)}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Button title="Accept" onPress={() => void run(() => social.accept(r.id))} />
            <Button
              variant="link"
              title="Decline"
              onPress={() => void run(() => social.decline(r.id))}
            />
          </View>
        </FriendRow>
      ))}

      {outgoing.length ? (
        <Text style={[styles.label, { marginTop: 20 }]}>Sent requests</Text>
      ) : null}
      {outgoing.map((r) => (
        <FriendRow key={r.id} user={r.user} subtitle={`Sent ${timeAgo(r.createdAt)}`}>
          <Button
            variant="link"
            title="Cancel"
            onPress={() => void run(() => social.cancel(r.id))}
          />
        </FriendRow>
      ))}

      <Text style={[styles.label, { marginTop: 20 }]}>Friends ({friends.length})</Text>
      {friends.length === 0 ? (
        <Text style={styles.muted}>
          No friends yet. Only people who accept your request become friends.
        </Text>
      ) : (
        friends.map((f) => (
          <FriendRow key={f.username} user={f} subtitle={`Friends since ${timeAgo(f.since)}`}>
            <Button variant="link" title="Remove" onPress={() => remove(f)} />
          </FriendRow>
        ))
      )}
    </ScrollView>
  );
}
