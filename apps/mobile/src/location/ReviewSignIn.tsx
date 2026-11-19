import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { Button } from '@/ui';
import { Text } from '@/text';

/**
 * D268: the server adds `reviewSignIn` to its "outside Duval County" answer while store review
 * mode is on. Reviewers (Apple, Google) are far from Jacksonville; they sign in with the review
 * account from the store's review notes, and the server places that account in Jacksonville.
 * The phone decides nothing: any other account is still refused.
 */
export function offersReviewSignIn(e: unknown): boolean {
  return (
    e instanceof ApiRequestError &&
    e.code === 'LOCATION_OUTSIDE_AREA' &&
    (e.details as { reviewSignIn?: unknown } | undefined)?.reviewSignIn === true
  );
}

export function ReviewSignIn() {
  const { signOut } = useAuth();
  return (
    <View
      style={{
        marginHorizontal: SPACE.md,
        marginVertical: SPACE.sm,
        padding: SPACE.lg,
        borderRadius: RADIUS.lg,
        backgroundColor: DARK.raised,
        gap: SPACE.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <Ionicons name="phone-portrait-outline" size={20} color={DARK.accent} />
        <Text style={[TYPE.label, { color: DARK.text, flex: 1 }]}>Testing JaxSide?</Text>
      </View>
      <Text style={[TYPE.callout, { color: DARK.textMuted }]}>
        If you&apos;re reviewing the app for the App Store or Google Play, sign in with the review
        account from the review notes. It works from anywhere.
      </Text>
      <Button
        variant="link"
        title="Sign in with a review account"
        onPress={() => void signOut()}
        style={{ paddingHorizontal: 0, alignSelf: 'flex-start' }}
      />
    </View>
  );
}
