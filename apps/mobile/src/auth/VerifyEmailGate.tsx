import { Modal, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK } from '@jax/shared';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { Button, KeyboardSafeView } from '@/ui';
import { useAuth } from './AuthContext';
import { EmailCodeCard } from './EmailCodeCard';

/**
 * D159: a signed-in account that hasn't confirmed its email sees this in front of the whole
 * app until the code is confirmed. It can't be closed (no ×, and Android's Back does
 * nothing); confirming makes it go away by itself. The only other way out is signing out,
 * so someone who typed the wrong email isn't stuck: that leaves the app, it doesn't get in.
 */
export function VerifyEmailGate() {
  const { state, signOut } = useAuth();
  const open = state.status === 'signedIn' && !state.user.emailVerified;
  if (state.status !== 'signedIn') return null;

  return (
    <Modal
      visible={open}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      // Back does nothing: the only ways out are confirming the email or signing out.
      onRequestClose={() => undefined}
    >
      <KeyboardSafeView style={{ flex: 1, backgroundColor: DARK.page }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: SPACE.lg }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md }}>
            <Ionicons name="mail-unread-outline" size={44} color={DARK.accent} />
            <Text accessibilityRole="header" style={[TYPE.title, { textAlign: 'center' }]}>
              Confirm your email
            </Text>
            <Text style={[TYPE.callout, { color: DARK.textMuted, textAlign: 'center' }]}>
              One last step. It keeps out bots and fake accounts.
            </Text>
          </View>
          <EmailCodeCard email={state.user.email} />
          <Button
            variant="link"
            title="Wrong email? Sign out"
            // No confirm: the app's pop-ups draw under this full-screen modal.
            onPress={() => void signOut()}
            style={{ marginTop: SPACE.lg }}
          />
        </ScrollView>
      </KeyboardSafeView>
    </Modal>
  );
}
