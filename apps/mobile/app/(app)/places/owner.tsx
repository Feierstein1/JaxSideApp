import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { Banner, Button, FormError, PageTitle, Screen } from '@/ui';

interface OwnerInfo {
  placeName: string;
  hasVerifiedOwner: boolean;
  /** The JaxSide for Business sign-up page; null until the website is public. */
  signupUrl: string | null;
}

const STEPS = [
  'Sign up for a business account on JaxSide for Business (it’s separate from your personal JaxSide account).',
  'Find your place there and verify that you run it, with Google or by asking JaxSide. Not on the map yet? Add it there.',
  'Then post and reply as “The Owner”, run ads and see how your area is doing.',
];

/**
 * B6.5 / D185 / D224: "I own this place". Owners don't verify in the app: a business
 * account lives on the JaxSide for Business website, fully separate from personal
 * accounts. This screen only explains that and links there (once it's public).
 */
export default function OwnerInfoScreen() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const [info, setInfo] = useState<OwnerInfo>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api
      .get<OwnerInfo>(`/api/v1/places/${placeId}/owner-info`)
      .then(setInfo)
      .catch((e: unknown) =>
        setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load this place.'),
      );
  }, [placeId]);

  return (
    <Screen>
      <PageTitle
        title="I own this place"
        subtitle={info ? `Run ${info.placeName} on JaxSide` : undefined}
        icon="storefront-outline"
      />
      {error ? <FormError>{error}</FormError> : null}
      {info ? (
        <View style={{ gap: SPACE.md }}>
          {info.hasVerifiedOwner ? (
            <Banner icon="ribbon-outline">
              {info.placeName} already has a verified owner. If it’s your business now, contact
              JaxSide and we’ll sort it out.
            </Banner>
          ) : null}
          <Text style={[TYPE.body, { color: DARK.textMuted }]}>
            Businesses are run from JaxSide for Business, a separate website for owners and their
            staff. Your personal account stays just you, everywhere in the app.
          </Text>
          {STEPS.map((s, i) => (
            <View key={s} style={{ flexDirection: 'row', gap: SPACE.sm }}>
              <Text style={[TYPE.headline, { color: DARK.accent, width: 22 }]}>{i + 1}</Text>
              <Text style={[TYPE.body, { flex: 1 }]}>{s}</Text>
            </View>
          ))}
          {info.signupUrl ? (
            <Button
              title="Go to JaxSide for Business"
              icon="open-outline"
              onPress={() => void Linking.openURL(info.signupUrl!)}
            />
          ) : (
            <View
              style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'center' }}
              accessibilityRole="text"
            >
              <Ionicons name="time-outline" size={18} color={DARK.textMuted} />
              <Text style={[TYPE.callout, { color: DARK.textMuted, flex: 1 }]}>
                JaxSide for Business is coming soon.
              </Text>
            </View>
          )}
          {info.hasVerifiedOwner ? (
            <Button
              variant="secondary"
              title="Contact JaxSide"
              icon="mail-outline"
              onPress={() => router.push('/account/contact')}
            />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
