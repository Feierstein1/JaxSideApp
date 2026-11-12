import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { DARK } from '@jax/shared';
import { api } from '@/api';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { Button, PageTitle, Screen } from '@/ui';

/** The JaxSide for Business website (the server's `BUSINESS_SITE_URL` sign-up page wins). */
const SITE = 'https://jaxside.com';

const STEPS = [
  'Sign up there for a business account. It’s separate from your personal JaxSide account.',
  'Choose what you are: a place in Jacksonville, an event organizer, or both.',
  'Create your event: its name, dates and times, where it is (your place, another place on JaxSide or an address) and pictures. Then send it for review.',
  'JaxSide checks every event. Once it’s approved it shows on this calendar, and you can post updates in its chat and promote it with an ad.',
];

/**
 * D233: "Want to add an event?". App users don't suggest events; businesses and organizers
 * add them on the JaxSide for Business website (D230 / D232), and JaxSide reviews each event
 * (organizers don't wait for an account approval, D237). This screen explains how and links
 * there.
 */
export default function HostEventScreen() {
  const [signupUrl, setSignupUrl] = useState(`${SITE}/signup`);

  useEffect(() => {
    api
      .get<{ signupUrl: string | null }>('/api/v1/events/host-info')
      .then((r) => r.signupUrl && setSignupUrl(r.signupUrl))
      .catch(() => undefined); // the website's own address still works
  }, []);

  return (
    <Screen>
      <PageTitle
        title="Post an event"
        subtitle="Hosting something in Duval County?"
        icon="calendar-outline"
      />
      <View style={{ gap: SPACE.md }}>
        <Text style={[TYPE.body, { color: DARK.textMuted }]}>
          Businesses and event organizers post events from{' '}
          <Text
            accessibilityRole="link"
            accessibilityHint="Opens jaxside.com in your browser"
            onPress={() => void Linking.openURL(SITE)}
            style={{ color: DARK.accent, fontWeight: '700', textDecorationLine: 'underline' }}
          >
            JaxSide for Business
          </Text>
          , a separate website. The first month is free.
        </Text>
        {STEPS.map((s, i) => (
          <View key={s} style={{ flexDirection: 'row', gap: SPACE.sm }}>
            <Text style={[TYPE.headline, { color: DARK.accent, width: 22 }]}>{i + 1}</Text>
            <Text style={[TYPE.body, { flex: 1 }]}>{s}</Text>
          </View>
        ))}
        <Button
          title="Go to JaxSide for Business"
          icon="open-outline"
          onPress={() => void Linking.openURL(signupUrl)}
        />
        <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
          Spotted an event that looks fake or private? Open it and report it.
        </Text>
      </View>
    </Screen>
  );
}
