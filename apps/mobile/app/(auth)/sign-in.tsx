import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loginRequestSchema, DARK } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { restrictedCredentials } from '@/standing/restricted-credentials';
import { serverErrors, validate, type FieldErrors } from '@/forms';
import { SPACE, TYPE } from '@/tokens';
import { Banner, BrandMark, Button, Field, FormError, PasswordField, KeyboardSafeView } from '@/ui';
import { Text } from '@/text';

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
        {/* D79: the Jax mark top-left like every other screen, then a big welcome line
            (no team names or marks, see UI_DESIGN.md). */}
        <View
          style={{
            paddingTop: insets.top + 14,
            paddingBottom: 32,
            paddingHorizontal: SPACE.xl,
            gap: SPACE.md,
          }}
        >
          <BrandMark />
          <Text
            accessibilityRole="header"
            style={[TYPE.display, { fontSize: 40, lineHeight: 46, marginTop: 28 }]}
          >
            Your neighborhood,{'\n'}
            <Text style={{ color: DARK.accent }}>live.</Text>
          </Text>
          <Text style={[TYPE.callout, { color: DARK.textMuted }]}>
            What’s happening around you in Jacksonville, from people who are actually there.
          </Text>
        </View>

        <View
          style={{
            flexGrow: 1,
            backgroundColor: DARK.card,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: SPACE.xl,
            paddingBottom: insets.bottom + SPACE.xl,
          }}
        >
          <Text style={[TYPE.title, { color: DARK.text, marginBottom: SPACE.lg }]}>Sign in</Text>
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
            <Text style={[TYPE.caption, { color: DARK.textMuted }]}>New to Jax?</Text>
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
