import { memo } from 'react';
import { View } from 'react-native';
import { DARK, type ChatLine } from '@jax/shared';
import { Text } from '@/text';
import { SPACE } from '@/tokens';
import { chatClock } from './api';

/** D218 / D230: one line in area or event chat: the username (tap for the profile or a report), the time, then the text. */
export const ChatLineRow = memo(function ChatLineRow({
  line,
  mine,
  onName,
}: {
  line: ChatLine;
  mine: boolean;
  onName: (username: string) => void;
}) {
  return (
    <View
      style={[
        { paddingHorizontal: SPACE.md, paddingVertical: 5 },
        // Staff lines stand out: the gold-tinted card and gold edge used on staff posts (D155).
        line.admin
          ? {
              backgroundColor: DARK.adminCard,
              borderLeftWidth: 4,
              borderLeftColor: DARK.adminEdge,
              marginVertical: 2,
            }
          : null,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text
          accessibilityRole={mine ? undefined : 'button'}
          accessibilityLabel={mine ? 'You' : `${line.username}: profile or report`}
          onPress={mine ? undefined : () => onName(line.username)}
          style={{
            fontSize: 13.5,
            fontWeight: '800',
            // Staff lines are gold (on dark); your own name is plain; others' names look tappable.
            color: line.admin ? DARK.adminEdge : mine ? DARK.text : DARK.accent,
          }}
        >
          {line.username}
        </Text>
        {line.admin ? (
          // The same blue as JAX in the JAXSIDE name (DARK.accent).
          <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: DARK.accent }}>
            ADMIN
          </Text>
        ) : null}
        <Text style={{ fontSize: 11, color: DARK.textMuted }}>{chatClock(line.createdAt)}</Text>
      </View>
      <Text style={{ fontSize: 14, lineHeight: 20 }}>{line.body}</Text>
    </View>
  );
});
