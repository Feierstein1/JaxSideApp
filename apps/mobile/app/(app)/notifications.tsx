import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { type NotificationView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { timeAgo } from '@/format';
import { haptic } from '@/motion';
import { social } from '@/social/api';
import { FriendRow } from '@/social/FriendRow';
import { clearUnread } from '@/social/unread';
import { Bone, Button, EmptyState, ErrorState, ListGroup, PageTitle, Pulse, Screen } from '@/ui';

/**
 * D76: the bell's list. Opening it marks everything read; requests can be answered here.
 * D79: dark page, requests waiting for an answer first, then everything else.
 */
export default function Notifications() {
  const [items, setItems] = useState<NotificationView[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();

  const load = useCallback(async () => {
    try {
      setItems((await social.notifications()).notifications);
      await social.markRead();
      clearUnread();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load notifications.');
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function answer(id: string, accept: boolean) {
    setBusy(id);
    try {
      await (accept ? social.accept(id) : social.decline(id));
      if (accept) haptic.success();
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t answer.');
    } finally {
      setBusy(undefined);
    }
  }

  const waiting = items?.filter((n) => n.actor && n.pendingRequestId) ?? [];
  const rest = items?.filter((n) => n.actor && !n.pendingRequestId) ?? [];

  return (
    <Screen>
      <PageTitle title="Notifications" icon="notifications-outline" inline />
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!items ? (
        error ? null : (
          <Pulse>
            <View style={{ gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Bone w={44} h={44} r={22} />
                  <View style={{ gap: 6, flex: 1 }}>
                    <Bone w="50%" h={13} />
                    <Bone w="70%" h={11} />
                  </View>
                </View>
              ))}
            </View>
          </Pulse>
        )
      ) : waiting.length + rest.length === 0 ? (
        <EmptyState
          icon="notifications-off-outline"
          title="You’re all caught up"
          body="Friend requests and accepted requests show up here."
        />
      ) : (
        <>
          {waiting.length ? (
            <ListGroup first title="Friend requests">
              {waiting.map((n) => (
                <FriendRow
                  key={n.id}
                  user={n.actor!}
                  subtitle={`Wants to be friends · ${timeAgo(n.createdAt)}`}
                >
                  <Button
                    size="sm"
                    title="Accept"
                    busy={busy === n.pendingRequestId}
                    onPress={() => void answer(n.pendingRequestId!, true)}
                    style={{ marginTop: 0 }}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    title="Decline"
                    onPress={() => void answer(n.pendingRequestId!, false)}
                    style={{ marginTop: 0 }}
                  />
                </FriendRow>
              ))}
            </ListGroup>
          ) : null}
          {rest.length ? (
            <ListGroup first={!waiting.length} title="Earlier">
              {rest.map((n) => (
                <FriendRow
                  key={n.id}
                  user={n.actor!}
                  subtitle={`${n.type === 'FRIEND_REQUEST' ? 'Sent you a friend request' : 'Accepted your friend request'} · ${timeAgo(n.createdAt)}`}
                />
              ))}
            </ListGroup>
          ) : null}
        </>
      )}
    </Screen>
  );
}
