import { useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { PASSWORD_MIN, registerRequestSchema, DARK } from '@jax/shared';
import { api } from '@/api';
import { serverErrors, validate, type FieldErrors } from '@/forms';
import { SPACE, TYPE } from '@/tokens';
import {
  Banner,
  Button,
  Field,
  FormError,
  PasswordField,
  styles,
  switchColors,
  KeyboardSafeView,
} from '@/ui';
import { Text } from '@/text';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [confirmAdult, setConfirmAdult] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    const v = validate(registerRequestSchema, {
      username,
      email,
      password,
      birthYear: birthYear.trim() === '' ? undefined : Number(birthYear),
      acceptTerms,
      confirmAdult,
    });
    // Confirmation is a client-side typo check only; it is never sent to the server.
    const mismatch = password !== confirmPassword ? "Passwords don't match" : undefined;
    if (!v.ok || mismatch) {
      return setErrors({
        ...(v.ok ? {} : v.errors),
        ...(mismatch ? { confirmPassword: mismatch } : {}),
      });
    }
    setErrors({});
    setBusy(true);
    try {
      await api.post('/api/v1/auth/register', v.data);
      router.replace({ pathname: '/sign-in', params: { registered: '1' } });
    } catch (e) {
      setErrors(serverErrors(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardSafeView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <Text style={[TYPE.title, { color: DARK.text }]}>Join your neighbors</Text>
        <Text style={[TYPE.callout, { color: DARK.textMuted, marginBottom: SPACE.lg }]}>
          A pseudonymous community for people in Jacksonville. Pick a username; nobody sees your
          real name or email.
        </Text>
        <Banner icon="shield-checkmark-outline">
          <Text style={[TYPE.callout, { color: DARK.text }]}>
            Jax is for adults 18 and older. We use your birth year only to check that, then discard
            it. We don&apos;t store it. Your email is stored encrypted and never shown to anyone.
            This is a simple age check, not identity verification.
          </Text>
        </Banner>
        <FormError>{errors.form}</FormError>
        <Field
          label="Username"
          icon="at"
          hint="This is the name people see. You can change it later."
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Letters, numbers, underscores"
          error={errors.username}
        />
        <Field
          label="Email (private)"
          icon="mail-outline"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          error={errors.email}
        />
        <PasswordField
          label="Password"
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          placeholder={`At least ${PASSWORD_MIN} characters`}
          error={errors.password}
        />
        <PasswordField
          label="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          error={errors.confirmPassword}
        />
        <Field
          label="Birth year"
          icon="calendar-outline"
          hint="Only used to check you're 18+. Not stored."
          value={birthYear}
          onChangeText={setBirthYear}
          keyboardType="number-pad"
          maxLength={4}
          placeholder="e.g. 1990"
          error={errors.birthYear}
        />
        <View style={{ marginTop: SPACE.sm }}>
          <SwitchRow label="I am 18 or older" value={confirmAdult} onChange={setConfirmAdult} />
          <FormError>{errors.confirmAdult}</FormError>
          <SwitchRow
            label="I accept the Terms of Service"
            value={acceptTerms}
            onChange={setAcceptTerms}
          />
          <FormError>{errors.acceptTerms}</FormError>
        </View>
        <Text style={[TYPE.caption, styles.muted, { marginTop: SPACE.xs }]}>
          Read the{' '}
          <Text style={styles.linkText} onPress={() => router.push('/legal/terms')}>
            Terms
          </Text>
          ,{' '}
          <Text style={styles.linkText} onPress={() => router.push('/legal/privacy')}>
            Privacy Policy
          </Text>{' '}
          and{' '}
          <Text style={styles.linkText} onPress={() => router.push('/legal/guidelines')}>
            Community Guidelines
          </Text>
          .
        </Text>
        <Button
          title="Create account"
          onPress={submit}
          busy={busy}
          style={{ marginTop: SPACE.lg }}
        />
      </ScrollView>
    </KeyboardSafeView>
  );
}

/** D78: the whole row toggles the switch (a bigger target than the switch alone). */
function SwitchRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
        minHeight: 52,
        paddingHorizontal: SPACE.md,
        marginBottom: SPACE.sm,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: value ? DARK.tealText : DARK.hairline,
        backgroundColor: pressed || value ? DARK.tealSoft : DARK.raised,
      })}
    >
      <Text style={[TYPE.body, { flex: 1, color: DARK.text }]}>{label}</Text>
      <Switch
        {...switchColors}
        value={value}
        onValueChange={onChange}
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}
