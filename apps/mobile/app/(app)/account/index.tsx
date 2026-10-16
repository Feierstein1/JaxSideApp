import { useCallback, useState, type ComponentProps, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BIO_MAX, BRAND, COLORS, CONFIG_DEFAULTS } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { EmailCodeCard } from '@/auth/EmailCodeCard';
import { categoryLabel } from '@/format';
import { Button, Segmented, styles } from '@/ui';

const GENERAL_OPTIONS = [0.25, 0.5, 0.75, 1];
const BUSINESS_OPTIONS = [0.1, 0.2, 0.3];

interface Favorite {
  id: string;
  name: string;
  category: string;
}

/**
 * Account, in two tabs (no location needed here, D16):
 * - Profile: what other people see (username, bio, join date); edit your bio (P4.8, early).
 * - Settings (P4.11): account changes, radius, favorites, blocked users, policies,
 *   location help, sign-out (only here) and account deletion.
 */
export default function AccountScreen() {
  const { state } = useAuth();
  const [tab, setTab] = useState<'profile' | 'settings'>('profile');
  if (state.status === 'guest') return <GuestAccount />;
  if (state.status !== 'signedIn') return null;

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={{ alignSelf: 'center', marginBottom: 12 }}>
        <Segmented
          options={[
            { key: 'profile', label: 'Profile' },
            { key: 'settings', label: 'Settings' },
          ]}
          value={tab}
          onChange={(v) => setTab(v as 'profile' | 'settings')}
        />
      </View>
      {tab === 'profile' ? <ProfileTab /> : <SettingsTab />}
    </ScrollView>
  );
}

function ProfileTab() {
  const { state, refresh } = useAuth();
  const user = state.status === 'signedIn' ? state.user : undefined;
  const [bio, setBio] = useState(user?.bio ?? '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!user) return null;

  const joined = new Date(user.joinedAt).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      await api.patch('/api/v1/me/profile', { bio: bio.trim() });
      await refresh();
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <View
        style={{
          alignItems: 'center',
          padding: 20,
          borderRadius: 12,
          backgroundColor: COLORS.surfaceInverse,
          borderBottomWidth: 4,
          borderBottomColor: BRAND.gold,
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: COLORS.primary,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 3,
            borderColor: BRAND.gold,
          }}
        >
          <Text style={{ color: COLORS.onPrimary, fontSize: 30, fontWeight: '700' }}>
            {user.username.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text
          style={{ color: COLORS.onSurfaceInverse, fontSize: 22, fontWeight: '700', marginTop: 10 }}
        >
          {user.username}
        </Text>
        <Text style={{ color: BRAND.gold, marginTop: 2 }}>Joined {joined}</Text>
      </View>

      <Text style={[styles.label, { marginTop: 16 }]}>About</Text>
      {editing ? (
        <>
          <TextInput
            accessibilityLabel="Your bio"
            value={bio}
            onChangeText={setBio}
            maxLength={BIO_MAX}
            multiline
            placeholder="A line or two about you (optional)"
            placeholderTextColor={COLORS.placeholder}
            style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
          />
          <Text style={styles.muted}>
            {bio.length}/{BIO_MAX}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Save" onPress={() => void save()} busy={busy} />
          <Button
            variant="link"
            title="Cancel"
            onPress={() => {
              setBio(user.bio ?? '');
              setEditing(false);
            }}
          />
        </>
      ) : (
        <>
          <Text style={[styles.body, !user.bio && styles.muted]}>{user.bio || 'No bio yet.'}</Text>
          <Button
            variant="link"
            title={user.bio ? 'Edit bio' : 'Add a bio'}
            onPress={() => setEditing(true)}
          />
        </>
      )}
      <Text style={[styles.muted, { marginTop: 12, fontSize: 13 }]}>
        This is what other people see. Your email is never shown. Profile photos and medals come in
        a later update.
      </Text>
    </View>
  );
}

function SettingsTab() {
  const { state, signOut, refresh } = useAuth();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [error, setError] = useState<string>();

  const loadFavorites = useCallback(async () => {
    try {
      setFavorites((await api.get<{ favorites: Favorite[] }>('/api/v1/me/favorites')).favorites);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load favorites.');
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void loadFavorites();
    }, [loadFavorites]),
  );

  if (state.status !== 'signedIn') return null;
  const { user } = state;
  const general = user.generalRadiusMiles ?? CONFIG_DEFAULTS['radius.general.defaultMiles'];
  const business = user.businessRadiusMiles ?? CONFIG_DEFAULTS['radius.business.defaultMiles'];

  async function setRadius(field: 'generalRadiusMiles' | 'businessRadiusMiles', miles: number) {
    try {
      await api.patch('/api/v1/me/preferences', { [field]: miles });
      await refresh();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t save.');
    }
  }

  return (
    <View>
      <Text style={styles.label}>Email (private)</Text>
      <Text style={styles.body}>
        {user.email} {user.emailVerified ? '· confirmed' : ''}
      </Text>
      {!user.emailVerified ? <EmailCodeCard email={user.email} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Section title="Your account">
        <Row icon="at" label="Change username" href="/account/username" />
        <Row icon="mail-outline" label="Change email" href="/account/email" />
        <Row icon="key-outline" label="Change password" href="/account/password" />
        <Row icon="ban-outline" label="Blocked users" href="/account/blocked" />
      </Section>

      <Text style={[styles.label, { marginTop: 20 }]}>Feed radius</Text>
      <Options
        values={GENERAL_OPTIONS}
        selected={general}
        onPick={(v) => setRadius('generalRadiusMiles', v)}
      />
      <Text style={[styles.label, { marginTop: 12 }]}>Business discussions radius</Text>
      <Options
        values={BUSINESS_OPTIONS}
        selected={business}
        onPick={(v) => setRadius('businessRadiusMiles', v)}
      />

      <Text style={[styles.label, { marginTop: 20 }]}>Favorite places</Text>
      {favorites.length === 0 ? (
        <Text style={styles.muted}>Save places from the Places tab.</Text>
      ) : (
        favorites.map((f) => (
          <Pressable
            key={f.id}
            accessibilityRole="button"
            onPress={() => router.push(`/places/${f.id}`)}
            style={{ paddingVertical: 8 }}
          >
            <Text style={styles.linkText}>
              ★ {f.name} <Text style={styles.muted}>· {categoryLabel(f.category)}</Text>
            </Text>
          </Pressable>
        ))
      )}

      <Section title="Safety">
        <Row icon="flag-outline" label="My reports" href="/account/reports" />
      </Section>

      <LocationHelp />
      <Policies />

      <View style={{ marginTop: 24 }}>
        <Button title="Sign out" onPress={signOut} />
        <Button
          variant="link"
          title="Delete account"
          onPress={() => router.push('/account/delete')}
        />
      </View>
    </View>
  );
}

/** P4.4 / P4.11: a guest sees their expiry, what guests can do, and the policies. */
function GuestAccount() {
  const { state, signOut } = useAuth();
  if (state.status !== 'guest') return null;
  const { guest } = state;
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>You’re browsing as a guest</Text>
      <View style={guest.expiringSoon ? styles.banner : undefined}>
        <Text style={styles.body}>
          Your guest session ends after {CONFIG_DEFAULTS['guest.inactivityDays']} days without use
          {guest.expiringSoon
            ? `, in ${guest.daysLeft} ${guest.daysLeft === 1 ? 'day' : 'days'}`
            : ''}
          . Using Jax resets the clock.
        </Text>
      </View>
      <Text style={[styles.body, { marginTop: 8 }]}>
        Guests can browse posts and comments in their area. To post, comment, vote, report, use
        business discussions and keep a profile, create a free account.
      </Text>
      <Button title="Sign up or sign in" onPress={() => void signOut()} />
      <LocationHelp />
      <Policies />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 20 }}>
      <Text style={styles.label}>{title}</Text>
      {children}
    </View>
  );
}

function Row({
  icon,
  label,
  href,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  href?: Href;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress ?? (() => href && router.push(href))}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.cardBorder,
      }}
    >
      <Ionicons name={icon} size={20} color={COLORS.primary} />
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </Pressable>
  );
}

/** P4.11: location-permission guidance (D16: foreground only, asked once). */
function LocationHelp() {
  return (
    <Section title="Location">
      <Text style={styles.body}>
        Jax uses your location only while the app is open, to show and verify conversations near
        you. It never tracks you in the background. To change this, open your phone’s settings.
      </Text>
      <Row
        icon="settings-outline"
        label="Open phone settings"
        onPress={() => void Linking.openSettings()}
      />
    </Section>
  );
}

function Policies() {
  return (
    <Section title="Policies">
      <Row icon="document-text-outline" label="Terms of Service" href="/account/legal/terms" />
      <Row icon="lock-closed-outline" label="Privacy Policy" href="/account/legal/privacy" />
      <Row icon="people-outline" label="Community Guidelines" href="/account/legal/guidelines" />
      <Row icon="time-outline" label="Data Retention" href="/account/legal/retention" />
    </Section>
  );
}

function Options({
  values,
  selected,
  onPick,
}: {
  values: number[];
  selected: number;
  onPick: (v: number) => void;
}) {
  return (
    <View style={[styles.row, { flexWrap: 'wrap' }]}>
      {values.map((v) => {
        const active = Math.abs(v - selected) < 1e-9;
        return (
          <Pressable
            key={v}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onPick(v)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: active ? COLORS.accent : COLORS.border,
              backgroundColor: active ? COLORS.accent : COLORS.background,
            }}
          >
            <Text style={{ color: active ? COLORS.onAccent : COLORS.text, fontWeight: '600' }}>
              {v} mi
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
