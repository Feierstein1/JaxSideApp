import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
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
 * - Settings: email confirmation, radius preferences, favorites, and sign-out (only here).
 */
export default function AccountScreen() {
  const { state } = useAuth();
  const [tab, setTab] = useState<'profile' | 'settings'>('profile');
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

      <View style={{ marginTop: 24 }}>
        <Button title="Sign out" onPress={signOut} />
      </View>
    </View>
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
