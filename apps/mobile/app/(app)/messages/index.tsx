import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { DARK, type ConversationSummary } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { postTime } from '@/format';
import { ProfileAvatar } from '@/profile/ProfileAvatar';
import { messagesApi } from '@/social/messages-api';
import { refreshUnreadMessages } from '@/social/messages-unread';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { EmptyState, ErrorState, PageTitle } from '@/ui';

/**
 * D98: your chats, newest first. Long-press a chat to delete it for yourself. New chats
 * start from a friend's profile or the friends list ("Message").
 */
export default function Messages() {
  const [items, setItems] = useState<ConversationSummary[]>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      setItems((await messagesApi.list()).conversations);
      void refreshUnreadMessages();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load your messages.');
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function remove(c: ConversationSummary) {
    Alert.alert(
      `Delete chat with ${c.with.username}?`,
      'It disappears for you only. New messages from them will still arrive.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete for me',
          style: 'destructive',
          onPress: () => void messagesApi.hideChat(c.id).then(load),
        },
      ],
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: DARK.page }}
      contentContainerStyle={{ padding: SPACE.md, gap: SPACE.sm, flexGrow: 1 }}
      data={items ?? []}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={
        <>
          <PageTitle
            title="Messages"
            icon="chatbubbles-outline"
            subtitle="Private chats with your friends."
          />
          {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        </>
      }
      ListEmptyComponent={
        items ? (
          <EmptyState
            icon="chatbubbles-outline"
            title="No chats yet"
            body="Message a friend from their profile or from Friends → Your friends."
          />
        ) : undefined
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Chat with ${item.with.username}${item.unread ? ', unread' : ''}: ${item.preview}`}
          onPress={() => router.push(`/messages/${encodeURIComponent(item.with.username)}`)}
          onLongPress={() => remove(item)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.md,
            padding: SPACE.md,
            borderRadius: RADIUS.lg,
            backgroundColor: pressed ? DARK.raised : DARK.card,
          })}
        >
          <ProfileAvatar name={item.with.username} url={item.with.avatarUrl} size={46} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontWeight: item.unread ? '800' : '700', fontSize: 16 }}>
              {item.with.username}
            </Text>
            <Text
              numberOfLines={1}
              style={[TYPE.caption, { color: item.unread ? DARK.text : DARK.textMuted }]}
            >
              {item.preview}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
              {postTime(item.lastMessageAt)}
            </Text>
            {item.unread ? (
              <View
                style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: DARK.accent }}
              />
            ) : null}
          </View>
        </Pressable>
      )}
    />
  );
}
