import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, loginRequestSchema } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { restrictedCredentials } from '@/standing/restricted-credentials';
import { serverErrors, validate, type FieldErrors } from '@/forms';
import { SPACE, TYPE } from '@/tokens';
import { Banner, Button, Field, FormError, PasswordField } from '@/ui';

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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: COLORS.surfaceInverse }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        {/* D78: a branded welcome on black (no team names or marks, see UI_DESIGN.md). */}
        <View
          style={{
            paddingTop: insets.top + 40,
            paddingBottom: 36,
            paddingHorizontal: SPACE.xl,
            alignItems: 'center',
            gap: SPACE.sm,
          }}
        >
          <View
            style={{
              width: 68,
              height: 68,
              borderRadius: 34,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: COLORS.accent,
              marginBottom: SPACE.xs,
            }}
          >
            <Ionicons name="location-sharp" size={36} color={COLORS.onAccent} />
          </View>
          <Text
            accessibilityRole="header"
            style={[TYPE.display, { color: COLORS.onSurfaceInverse }]}
          >
            Jax
          </Text>
          <Text style={[TYPE.callout, { color: COLORS.onSurfaceDarkMuted, textAlign: 'center' }]}>
            What’s happening around you in Jacksonville, from people who are actually there.
          </Text>
        </View>

        <View
          style={{
            flexGrow: 1,
            backgroundColor: COLORS.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: SPACE.xl,
            paddingBottom: insets.bottom + SPACE.xl,
          }}
        >
          <Text style={[TYPE.title, { color: COLORS.text, marginBottom: SPACE.lg }]}>Sign in</Text>
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
            <View style={{ flex: 1, height: 1, backgroundColor: COLORS.cardBorder }} />
            <Text style={[TYPE.caption, { color: COLORS.textMuted }]}>New to Jax?</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: COLORS.cardBorder }} />
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
          <Text style={[TYPE.caption, { color: COLORS.textMuted, textAlign: 'center' }]}>
            Guests can browse posts nearby right away. Posting, commenting, voting and place
            discussions need a free account.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
