import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  BIO_MAX,
  categoryColor,
  COLORS,
  CONFIG_DEFAULTS,
  RADIUS_OPTIONS_MILES,
  yardsLabel,
  PROFILE_COLORS,
  profileColor,
  textOn,
  type Medal,
} from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { EmailCodeCard } from '@/auth/EmailCodeCard';
import { sendScreened } from '@/discussion/screening';
import { MedalList } from '@/profile/Medals';
import { ProfileAvatar } from '@/profile/ProfileAvatar';
import { pickPhoto, uploadPhoto } from '@/discussion/photos';
import { categoryLabel } from '@/format';
import { haptic } from '@/motion';
import { categoryIcon } from '@/places/PlaceHeader';
import { elevation, RADIUS, SPACE, TYPE } from '@/tokens';
import { Button, FormError, ListGroup, ListRow, Segmented, Sheet, styles } from '@/ui';

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
 *
 * D78: a light grey page with white grouped cards (the standard settings look), so it
 * reads as a calm, different place from the dark feeds.
 */
export default function AccountScreen() {
  const { state } = useAuth();
  const [tab, setTab] = useState<'profile' | 'settings'>('profile');
  if (state.status === 'guest') return <GuestAccount />;
  if (state.status !== 'signedIn') return null;

  return (
    <ScrollView
      style={{ backgroundColor: COLORS.surfaceMuted }}
      contentContainerStyle={{ padding: SPACE.lg, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <Segmented
        stretch
        options={[
          { key: 'profile', label: 'Profile' },
          { key: 'settings', label: 'Settings' },
        ]}
        value={tab}
        onChange={(v) => setTab(v as 'profile' | 'settings')}
      />
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
  const [medals, setMedals] = useState<Medal[]>();
  useFocusEffect(
    useCallback(() => {
      api
        .get<{ medals: Medal[] }>('/api/v1/me/medals')
        .then((r) => setMedals(r.medals))
        .catch(() => setMedals([]));
    }, []),
  );
  const [photoBusy, setPhotoBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  /** P6.5: pick, upload (cleaned on the server), then set as the profile photo. */
  async function changePhoto() {
    const asset = await pickPhoto({ square: true });
    if (!asset) return;
    setPhotoBusy(true);
    setError(undefined);
    try {
      const up = await uploadPhoto(asset);
      await api.put('/api/v1/me/avatar', { photoId: up.id });
      await refresh();
      haptic.success();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t change the photo.');
    } finally {
      setPhotoBusy(false);
    }
  }
  if (!user) return null;

  const joined = new Date(user.joinedAt).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const sent = await sendScreened((confirmWarning) =>
        api.patch('/api/v1/me/profile', { bio: bio.trim(), confirmWarning }),
      );
      if (!sent) return;
      await refresh();
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t save.');
    } finally {
      setBusy(false);
    }
  }

  const color = profileColor(user.color);

  return (
    <View>
      {/* Header in your account color (D69). */}
      <View
        style={{
          alignItems: 'center',
          paddingTop: SPACE.xl,
          paddingBottom: SPACE.xl - 4,
          paddingHorizontal: SPACE.lg,
          marginTop: SPACE.lg,
          borderRadius: RADIUS.lg + 4,
          backgroundColor: color.hex,
          ...elevation(1),
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change your color"
          onPress={() => setPicking(true)}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            height: 36,
            paddingHorizontal: 12,
            borderRadius: 18,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderWidth: 1.5,
            borderColor: color.text,
          }}
        >
          <Ionicons name="color-palette-outline" size={16} color={color.text} />
          <Text style={{ color: color.text, fontWeight: '700', fontSize: 13 }}>Color</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={user.avatarUrl ? 'Change profile photo' : 'Add a profile photo'}
          accessibilityState={{ busy: photoBusy }}
          onPress={() => void changePhoto()}
          disabled={photoBusy}
        >
          <ProfileAvatar
            name={user.username}
            url={user.avatarUrl}
            size={92}
            ringColor={color.text}
          />
          {/* D78: camera badge on the photo, the usual "tap to change" cue. */}
          <View
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: COLORS.accent,
              borderWidth: 2,
              borderColor: COLORS.background,
            }}
          >
            <Ionicons
              name={photoBusy ? 'hourglass-outline' : 'camera'}
              size={16}
              color={COLORS.onAccent}
            />
          </View>
        </Pressable>
        <Text style={{ color: color.text, fontSize: 24, fontWeight: '900', marginTop: 12 }}>
          {user.username}
        </Text>
        <Text style={{ color: color.text, marginTop: 2, fontWeight: '600' }}>Joined {joined}</Text>
      </View>

      <ListGroup title="About">
        <View style={{ padding: SPACE.lg }}>
          {editing ? (
            <>
              <TextInput
                accessibilityLabel="Your bio"
                value={bio}
                onChangeText={setBio}
                maxLength={BIO_MAX}
                multiline
                autoFocus
                placeholder="A line or two about you (optional)"
                placeholderTextColor={COLORS.placeholder}
                style={[styles.input, { minHeight: 96, textAlignVertical: 'top' }]}
              />
              <Text style={[styles.hint, { textAlign: 'right' }]}>
                {bio.length}/{BIO_MAX}
              </Text>
              {error ? <FormError>{error}</FormError> : null}
              <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                <Button
                  variant="secondary"
                  title="Cancel"
                  style={{ flex: 1 }}
                  onPress={() => {
                    setBio(user.bio ?? '');
                    setEditing(false);
                  }}
                />
                <Button title="Save" style={{ flex: 1 }} onPress={() => void save()} busy={busy} />
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.body, !user.bio && styles.muted]}>
                {user.bio || 'No bio yet. Say a little about yourself.'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setEditing(true)}
                style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 44,
                }}
              >
                <Ionicons name="create-outline" size={17} color={COLORS.primary} />
                <Text style={styles.linkText}>{user.bio ? 'Edit bio' : 'Add a bio'}</Text>
              </Pressable>
            </>
          )}
        </View>
      </ListGroup>

      <ListGroup title="Medals">
        <View style={{ padding: SPACE.lg }}>{medals ? <MedalList medals={medals} /> : null}</View>
      </ListGroup>
      {error && !editing ? (
        <View style={{ marginTop: SPACE.md }}>
          <FormError>{error}</FormError>
        </View>
      ) : null}

      <ColorPicker
        open={picking}
        current={user.color}
        onClose={() => setPicking(false)}
        onPick={async (key) => {
          setPicking(false);
          try {
            await api.patch('/api/v1/me/color', { color: key });
            await refresh();
            haptic.success();
          } catch (e) {
            setError(e instanceof ApiRequestError ? e.message : 'Couldn’t change the color.');
          }
        }}
      />
    </View>
  );
}

/** D69: pick an account color from the palette (24 colors). */
function ColorPicker({
  open,
  current,
  onClose,
  onPick,
}: {
  open: boolean;
  current: string;
  onClose: () => void;
  onPick: (key: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Your color">
      <View style={{ paddingHorizontal: 20, paddingBottom: SPACE.sm }}>
        <Text style={[TYPE.callout, { color: COLORS.textMuted, marginBottom: SPACE.lg }]}>
          Used for your profile and the header of your posts.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
          {PROFILE_COLORS.map((c) => {
            const selected = c.key === current;
            return (
              <Pressable
                key={c.key}
                accessibilityRole="radio"
                accessibilityLabel={c.name}
                accessibilityState={{ selected }}
                onPress={() => {
                  haptic.select();
                  onPick(c.key);
                }}
                style={({ pressed }) => ({
                  width: 46,
                  height: 46,
                  borderRadius: 23,
                  backgroundColor: c.hex,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: selected ? 3 : 1,
                  borderColor: selected ? COLORS.text : COLORS.cardBorder,
                  transform: [{ scale: pressed ? 0.9 : 1 }],
                })}
              >
                {selected ? <Ionicons name="checkmark" size={24} color={textOn(c.hex)} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Sheet>
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
  const radius = Math.min(
    user.radiusMiles ?? CONFIG_DEFAULTS['radius.general.defaultMiles'],
    CONFIG_DEFAULTS['radius.general.maxMiles'],
  );

  async function setRadius(miles: number) {
    try {
      await api.patch('/api/v1/me/preferences', { radiusMiles: miles });
      await refresh();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t save.');
    }
  }

  return (
    <View>
      {error ? (
        <View style={{ marginTop: SPACE.lg }}>
          <FormError>{error}</FormError>
        </View>
      ) : null}

      <ListGroup title="Email" footer="Private. Never shown to anyone.">
        <ListRow
          icon="mail-outline"
          label={user.email}
          right={
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: RADIUS.pill,
                backgroundColor: user.emailVerified ? COLORS.primarySoft : COLORS.accentSoft,
              }}
            >
              <Ionicons
                name={user.emailVerified ? 'checkmark-circle' : 'alert-circle'}
                size={14}
                color={user.emailVerified ? COLORS.primary : COLORS.text}
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '800',
                  color: user.emailVerified ? COLORS.primary : COLORS.text,
                }}
              >
                {user.emailVerified ? 'Confirmed' : 'Not confirmed'}
              </Text>
            </View>
          }
        />
      </ListGroup>
      {!user.emailVerified ? <EmailCodeCard email={user.email} /> : null}

      <ListGroup title="Your account">
        <ListRow icon="at" label="Change username" href="/account/username" />
        <ListRow icon="mail-outline" label="Change email" href="/account/email" />
        <ListRow icon="key-outline" label="Change password" href="/account/password" />
        <ListRow icon="ban-outline" label="Blocked users" href="/account/blocked" />
      </ListGroup>

      <ListGroup
        title="Radius"
        footer={`How far around you the feed and Places reach. To comment, vote or join a business discussion you need to be within ${yardsLabel(CONFIG_DEFAULTS['radius.general.maxMiles'])} of it.`}
      >
        <View style={{ padding: SPACE.md }}>
          <Segmented
            stretch
            options={RADIUS_OPTIONS_MILES.map((v) => ({ key: String(v), label: yardsLabel(v) }))}
            value={String(RADIUS_OPTIONS_MILES.find((v) => Math.abs(v - radius) < 1e-9) ?? radius)}
            onChange={(k) => void setRadius(Number(k))}
          />
        </View>
      </ListGroup>

      <ListGroup
        title="Favorite places"
        footer={favorites.length === 0 ? 'Tap the ☆ on a place to save it here.' : undefined}
      >
        {favorites.length === 0 ? (
          <ListRow icon="star-outline" label="No favorites yet" />
        ) : (
          favorites.map((f) => (
            <ListRow
              key={f.id}
              icon={categoryIcon(f.category)}
              iconColor={categoryColor(f.category)}
              label={f.name}
              detail={categoryLabel(f.category)}
              href={`/places/${f.id}`}
            />
          ))
        )}
      </ListGroup>

      <ListGroup title="Safety">
        <ListRow icon="flag-outline" label="My reports" href="/account/reports" />
        <ListRow icon="add-circle-outline" label="My suggestions" href="/account/suggestions" />
        <ListRow
          icon="shield-checkmark-outline"
          label="Account standing"
          href="/account/standing"
        />
      </ListGroup>

      <LocationHelp />
      <Policies />

      <ListGroup>
        <ListRow icon="log-out-outline" label="Sign out" tone="primary" onPress={signOut} />
        <ListRow icon="trash-outline" label="Delete account" tone="danger" href="/account/delete" />
      </ListGroup>
    </View>
  );
}

/** P4.4 / P4.11: a guest sees their expiry, what guests can do, and the policies. */
function GuestAccount() {
  const { state, signOut } = useAuth();
  if (state.status !== 'guest') return null;
  const { guest } = state;
  return (
    <ScrollView
      style={{ backgroundColor: COLORS.surfaceMuted }}
      contentContainerStyle={{ padding: SPACE.lg, paddingBottom: 48 }}
    >
      <View
        style={{
          alignItems: 'center',
          padding: SPACE.xl,
          gap: SPACE.sm,
          borderRadius: RADIUS.lg + 4,
          backgroundColor: COLORS.surfaceInverse,
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: COLORS.surfaceDarkRaised,
          }}
        >
          <Ionicons name="person-outline" size={34} color={COLORS.accent} />
        </View>
        <Text
          accessibilityRole="header"
          style={[TYPE.title, { color: COLORS.onSurfaceInverse, textAlign: 'center' }]}
        >
          You’re browsing as a guest
        </Text>
        <Text style={[TYPE.callout, { color: COLORS.onSurfaceDarkMuted, textAlign: 'center' }]}>
          Guests can browse posts and comments nearby. Create a free account to post, comment, vote,
          report, join place discussions and keep a profile.
        </Text>
        <Button
          variant="accent"
          title="Sign up or sign in"
          icon="person-add-outline"
          onPress={() => void signOut()}
          style={{ alignSelf: 'stretch', marginTop: SPACE.md }}
        />
      </View>
      <ListGroup
        title="Guest session"
        footer={`Your guest session ends after ${CONFIG_DEFAULTS['guest.inactivityDays']} days without use. Using Jax resets the clock.`}
      >
        <ListRow
          icon="time-outline"
          label={
            guest.expiringSoon
              ? `Ends in ${guest.daysLeft} ${guest.daysLeft === 1 ? 'day' : 'days'}`
              : 'Active'
          }
        />
      </ListGroup>
      <LocationHelp />
      <Policies />
    </ScrollView>
  );
}

/** P4.11: location-permission guidance (D16: foreground only, asked once). */
function LocationHelp() {
  return (
    <ListGroup
      title="Location"
      footer="Jax uses your location only while the app is open, to show and verify conversations near you. It never tracks you in the background."
    >
      <ListRow
        icon="settings-outline"
        label="Open phone settings"
        onPress={() => void Linking.openSettings()}
      />
    </ListGroup>
  );
}

function Policies() {
  return (
    <ListGroup title="Policies">
      <ListRow icon="document-text-outline" label="Terms of Service" href="/account/legal/terms" />
      <ListRow icon="lock-closed-outline" label="Privacy Policy" href="/account/legal/privacy" />
      <ListRow
        icon="people-outline"
        label="Community Guidelines"
        href="/account/legal/guidelines"
      />
      <ListRow icon="time-outline" label="Data Retention" href="/account/legal/retention" />
    </ListGroup>
  );
}
