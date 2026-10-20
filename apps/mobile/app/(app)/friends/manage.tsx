import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK, type FriendRequestView, type FriendView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { postTime } from '@/format';
import { haptic } from '@/motion';
import { social } from '@/social/api';
import { FriendRow } from '@/social/FriendRow';
import { refreshUnread } from '@/social/unread';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import {
  Banner,
  Bone,
  Button,
  Field,
  FormError,
  ListGroup,
  openMenu,
  PageTitle,
  Pulse,
  Screen,
} from '@/ui';
import { showAlert } from '@/dialog';

/**
 * D76: add a friend by username, answer requests, and see or remove friends.
 * D79: dark page with a title; add-by-username at the top; requests, sent requests and
 * friends in grouped cards. Removing a friend is in each friend's "•••" (asks first).
 */
/** D89: also shown inside the Friends tab ("Your friends" side of the switch). */
export function FriendsManager({ embedded = false }: { embedded?: boolean }) {
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
      haptic.success();
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
    showAlert(
      `Remove ${f.username}?`,
      'You can send a new request later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void run(() => social.unfriend(f.username)),
        },
      ],
      { icon: 'person-remove-outline' },
    );
  }

  const canSend = !!name.trim().replace(/^@/, '') && !busy;

  return (
    <Screen keyboard>
      {embedded ? (
        <Text style={[TYPE.callout, { color: DARK.textMuted, marginBottom: SPACE.lg }]}>
          Friends see where you post (not what), and which places you’ve favorited.
        </Text>
      ) : (
        <PageTitle
          title="Your friends"
          subtitle="Friends see where you post (not what), and which places you’ve favorited."
          icon="people-outline"
          inline
        />
      )}

      {/* Add by username, with the send button inside the row. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Add a friend by username"
            icon="at"
            value={name}
            onChangeText={setName}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={21}
            placeholder="username"
            returnKeyType="send"
            onSubmitEditing={() => void send()}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send friend request"
          accessibilityState={{ disabled: !canSend, busy }}
          disabled={!canSend}
          onPress={() => void send()}
          style={({ pressed }) => ({
            width: 52,
            height: 52,
            marginBottom: SPACE.lg,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: canSend ? DARK.accent : DARK.raised,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Ionicons
            name={busy ? 'hourglass-outline' : 'person-add'}
            size={21}
            color={canSend ? DARK.onAccent : DARK.textMuted}
          />
        </Pressable>
      </View>
      {note ? (
        <Banner tone="success" icon="checkmark-circle">
          {note}
        </Banner>
      ) : null}
      <FormError>{error}</FormError>

      {!friends ? (
        error ? null : (
          <Pulse>
            <View style={{ gap: 12, marginTop: SPACE.md }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Bone w={44} h={44} r={22} />
                  <Bone w="45%" h={13} />
                </View>
              ))}
            </View>
          </Pulse>
        )
      ) : (
        <>
          {incoming.length ? (
            <ListGroup title={`Requests for you · ${incoming.length}`}>
              {incoming.map((r) => (
                <FriendRow
                  key={r.id}
                  user={r.user}
                  subtitle={`Wants to be friends · ${postTime(r.createdAt)}`}
                >
                  <Button
                    size="sm"
                    title="Accept"
                    onPress={() =>
                      void run(async () => {
                        await social.accept(r.id);
                        haptic.success();
                      })
                    }
                    style={{ marginTop: 0 }}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    title="Decline"
                    onPress={() => void run(() => social.decline(r.id))}
                    style={{ marginTop: 0 }}
                  />
                </FriendRow>
              ))}
            </ListGroup>
          ) : null}

          {outgoing.length ? (
            <ListGroup title="Sent requests">
              {outgoing.map((r) => (
                <FriendRow key={r.id} user={r.user} subtitle={`Sent ${postTime(r.createdAt)}`}>
                  <Button
                    size="sm"
                    variant="secondary"
                    title="Cancel"
                    onPress={() => void run(() => social.cancel(r.id))}
                    style={{ marginTop: 0 }}
                  />
                </FriendRow>
              ))}
            </ListGroup>
          ) : null}

          <ListGroup title={`Friends · ${friends.length}`}>
            {friends.length === 0 ? (
              <View style={{ padding: SPACE.lg, alignItems: 'center', gap: 6 }}>
                <Ionicons name="people-outline" size={28} color={DARK.accent} />
                <Text style={[TYPE.callout, { color: DARK.textMuted, textAlign: 'center' }]}>
                  No friends yet. Only people who accept your request become friends.
                </Text>
              </View>
            ) : (
              friends.map((f) => (
                <FriendRow
                  key={f.username}
                  user={f}
                  subtitle={`Friends since ${new Date(f.since).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })}`}
                >
                  {/* D98: message a friend. */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Message ${f.username}`}
                    onPress={() => router.push(`/messages/${encodeURIComponent(f.username)}`)}
                    hitSlop={6}
                    style={{
                      width: 40,
                      height: 40,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color={DARK.accent} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`More options for ${f.username}`}
                    onPress={() =>
                      openMenu(f.username, [
                        {
                          label: 'Remove friend',
                          icon: 'person-remove-outline',
                          destructive: true,
                          onPress: () => remove(f),
                        },
                      ])
                    }
                    style={{
                      width: 44,
                      height: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="ellipsis-horizontal" size={20} color={DARK.textMuted} />
                  </Pressable>
                </FriendRow>
              ))
            )}
          </ListGroup>
        </>
      )}
    </Screen>
  );
}

export default function ManageFriends() {
  return <FriendsManager />;
}
