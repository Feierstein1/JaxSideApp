import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { FormError, PageTitle, Screen, Button } from '@/ui';

const STEPS = [
  'Go to JaxSide for Business and sign up for a business account. It’s separate from your personal JaxSide account.',
  'Choose what you are: a place in Jacksonville, an event organizer, or both. Organizers wait for JaxSide to approve the account.',
  'Create your event: its name, dates and times, where it is (your place, another place on JaxSide or an address) and pictures. Then send it for review.',
  'JaxSide checks every event. Once it’s approved it shows on this calendar, and you can post updates in its chat and promote it with an ad.',
];

/**
 * D233: "Post an event". App users don't suggest events; businesses and organizers add
 * them on the JaxSide for Business website (D230 / D232), and JaxSide reviews each one. This
 * screen explains how and links there (once it's public).
 */
export default function HostEventScreen() {
  const [signupUrl, setSignupUrl] = useState<string | null>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api
      .get<{ signupUrl: string | null }>('/api/v1/events/host-info')
      .then((r) => setSignupUrl(r.signupUrl))
      .catch((e: unknown) =>
        setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load this page.'),
      );
  }, []);

  return (
    <Screen>
      <PageTitle
        title="Post an event"
        subtitle="Events are added on JaxSide for Business"
        icon="calendar-outline"
      />
      {error ? <FormError>{error}</FormError> : null}
      <View style={{ gap: SPACE.md }}>
        <Text style={[TYPE.body, { color: DARK.textMuted }]}>
          Hosting something in Duval County? Businesses and event organizers post events from
          JaxSide for Business, a separate website. The first month is free.
        </Text>
        {STEPS.map((s, i) => (
          <View key={s} style={{ flexDirection: 'row', gap: SPACE.sm }}>
            <Text style={[TYPE.headline, { color: DARK.accent, width: 22 }]}>{i + 1}</Text>
            <Text style={[TYPE.body, { flex: 1 }]}>{s}</Text>
          </View>
        ))}
        {signupUrl ? (
          <Button
            title="Go to JaxSide for Business"
            icon="open-outline"
            onPress={() => void Linking.openURL(signupUrl)}
          />
        ) : signupUrl === null ? (
          <View
            style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'center' }}
            accessibilityRole="text"
          >
            <Ionicons name="time-outline" size={18} color={DARK.textMuted} />
            <Text style={[TYPE.callout, { color: DARK.textMuted, flex: 1 }]}>
              JaxSide for Business is coming soon.
            </Text>
          </View>
        ) : null}
        <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
          Spotted an event that looks fake or private? Open it and report it.
        </Text>
      </View>
    </Screen>
  );
}
