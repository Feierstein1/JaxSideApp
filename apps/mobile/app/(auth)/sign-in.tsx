import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { loginRequestSchema, DARK, EMBLEM } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Emblem, Wordmark } from '@/brand/Emblem';
import { restrictedCredentials } from '@/standing/restricted-credentials';
import { serverErrors, validate, type FieldErrors } from '@/forms';
import { SPACE, TYPE } from '@/tokens';
import { Banner, Button, Field, FormError, PasswordField, KeyboardSafeView } from '@/ui';
import { Text } from '@/text';

/** Sunburst rays from a point below the emblem, like the icon's (drawn in a 360 x 300 box). */
const RAYS = Array.from({ length: 18 }, (_, i) => {
  const a1 = (i / 18) * Math.PI * 2;
  const a2 = a1 + Math.PI / 30;
  const [cx, cy, r] = [180, 230, 900];
  const p = (a: number) =>
    `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  return `M${cx} ${cy} L${p(a1)} L${p(a2)} Z`;
}).join(' ');

/** The icon's stepped frame top, as the edge between the navy header and the form card. */
const STEPS = 'M0 34 V24 H50 V14 H100 V4 H260 V14 H310 V24 H360 V34 Z';

export default function SignIn() {
  const { signIn, continueAsGuest } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ registered?: string; reset?: string }>();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);
  /** P5.7: banned or suspended; offer the appeal screen. */
  const [restricted, setRestricted] = useState(false);

  async function guest() {
    setErrors({});
    setGuestBusy(true);
    try {
      await continueAsGuest();
    } catch (e) {
      setErrors(serverErrors(e));
    } finally {
      setGuestBusy(false);
    }
  }

  async function submit() {
    const v = validate(loginRequestSchema, { identifier, password });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setRestricted(false);
    setBusy(true);
    try {
      await signIn(v.data.identifier, v.data.password);
    } catch (e) {
      setErrors(serverErrors(e));
      if (
        e instanceof ApiRequestError &&
        (e.code === 'ACCOUNT_BANNED' || e.code === 'ACCOUNT_SUSPENDED')
      ) {
        restrictedCredentials.set(v.data.identifier, v.data.password);
        setRestricted(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardSafeView style={{ flex: 1, backgroundColor: DARK.bar }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        {/* D121: a navy deco header with the icon's sunburst rays, the emblem and the name,
            ending in the icon's stepped edge above the form (no team names or marks). */}
        <View
          style={{
            backgroundColor: EMBLEM.navy,
            paddingTop: insets.top + SPACE.xl,
            paddingBottom: 56,
            paddingHorizontal: SPACE.xl,
            alignItems: 'center',
            gap: SPACE.md,
            overflow: 'hidden',
          }}
        >
          <Svg
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            viewBox="0 0 360 300"
            preserveAspectRatio="xMidYMid slice"
          >
            <Path d={RAYS} fill={EMBLEM.ray} />
          </Svg>
          <View style={{ borderWidth: 2, borderColor: EMBLEM.building, borderRadius: 24 }}>
            <Emblem size={92} />
          </View>
          <View accessible accessibilityRole="header" accessibilityLabel="JaxSide">
            <Wordmark fontSize={32} fill={1} />
          </View>
          <Text style={[TYPE.callout, { color: EMBLEM.onNavyMuted, textAlign: 'center' }]}>
            Your neighborhood, live. What’s happening around you in Jacksonville, from people who
            are actually there.
          </Text>
        </View>
        <Svg
          width="100%"
          height={34}
          viewBox="0 0 360 34"
          preserveAspectRatio="none"
          style={{ marginTop: -34 }}
        >
          <Path d={STEPS} fill={DARK.card} />
        </Svg>

        <View
          style={{
            flexGrow: 1,
            backgroundColor: DARK.card,
            paddingHorizontal: SPACE.xl,
            paddingTop: SPACE.sm,
            paddingBottom: insets.bottom + SPACE.xl,
          }}
        >
          <Text
            style={[TYPE.title, { color: DARK.text, marginBottom: SPACE.lg, textAlign: 'center' }]}
          >
            Sign in
          </Text>
          {params.registered ? (
            <Banner icon="checkmark-circle-outline">
              Account created. Sign in, then enter the 6-digit code we emailed you.
            </Banner>
          ) : null}
          {params.reset ? (
            <Banner icon="checkmark-circle-outline">
              Password changed. Sign in with your new password.
            </Banner>
          ) : null}
          <FormError>{errors.form}</FormError>
          {restricted ? (
            <Button
              variant="secondary"
              title="See why and appeal"
              onPress={() => router.push('/appeal')}
              style={{ marginBottom: SPACE.md }}
            />
          ) : null}
          <Field
            label="Username or email"
            icon="person-outline"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            error={errors.identifier}
          />
          <PasswordField
            label="Password"
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            error={errors.password}
            onSubmitEditing={submit}
          />
          <Button
            variant="link"
            title="Forgot password?"
            onPress={() => router.push('/forgot-password')}
            style={{ alignSelf: 'flex-end', marginTop: -SPACE.sm, paddingHorizontal: 0 }}
          />
          <Button title="Sign in" onPress={submit} busy={busy} />

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.md,
              marginVertical: SPACE.lg,
            }}
          >
            <View style={{ flex: 1, height: 1, backgroundColor: DARK.hairline }} />
            <Text style={[TYPE.caption, { color: DARK.textMuted }]}>New to JaxSide?</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: DARK.hairline }} />
          </View>
          <Button
            variant="secondary"
            title="Create an account"
            onPress={() => router.push('/register')}
            style={{ marginTop: 0 }}
          />
          <Button
            variant="link"
            title="Just looking? Continue as guest"
            onPress={guest}
            busy={guestBusy}
            style={{ marginTop: SPACE.sm }}
          />
          <Text style={[TYPE.caption, { color: DARK.textMuted, textAlign: 'center' }]}>
            Guests can browse posts nearby right away. Posting, commenting, voting and place
            discussions need a free account.
          </Text>
        </View>
      </ScrollView>
    </KeyboardSafeView>
  );
}
