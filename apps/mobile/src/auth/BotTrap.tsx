import { Switch, View } from 'react-native';

/**
 * D160: a checkbox no person can see or reach. It's off-screen, see-through, ignores touches,
 * and is hidden from screen readers (VoiceOver and TalkBack), so nobody ticks it by accident.
 * Only a bot filling in every field ticks it, and the server then bans that account.
 */
export function BotTrap({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        left: -10000,
        width: 1,
        height: 1,
        opacity: 0,
        overflow: 'hidden',
      }}
    >
      <Switch
        testID="newsletterOptIn"
        nativeID="newsletterOptIn"
        value={value}
        onValueChange={onChange}
        focusable={false}
      />
    </View>
  );
}
