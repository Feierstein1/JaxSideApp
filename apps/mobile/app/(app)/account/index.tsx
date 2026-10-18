import { social } from '@/social/api';
import { useCallback, useState, type ComponentProps, type ReactNode } from 'react';
import { Linking, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  BIO_MAX,
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
import { Button, Segmented, styles, switchColors } from '@/ui';

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
    <View style={{ gap: 16 }}>
      {/* Header in your account color (D69). */}
      <View
        style={{
          alignItems: 'center',
          padding: 20,
          borderRadius: 12,
          backgroundColor: color.hex,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change your color"
          onPress={() => setPicking(true)}
          hitSlop={8}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: color.text,
          }}
        >
          <Ionicons name="brush" size={18} color={color.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          onPress={() => void changePhoto()}
          disabled={photoBusy}
        >
          <ProfileAvatar name={user.username} url={user.avatarUrl} ringColor={color.text} />
        </Pressable>
        <Text
          style={{ color: color.text, marginTop: 6, fontSize: 13, fontWeight: '600' }}
          onPress={() => void changePhoto()}
        >
          {photoBusy ? 'Uploading…' : user.avatarUrl ? 'Change photo' : 'Add a photo'}
        </Text>
        <Text style={{ color: color.text, fontSize: 22, fontWeight: '800', marginTop: 10 }}>
          {user.username}
        </Text>
        <Text style={{ color: color.text, marginTop: 2 }}>Joined {joined}</Text>
      </View>

      <ProfileSection title="About">
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
              style={[
                styles.input,
                {
                  minHeight: 90,
                  textAlignVertical: 'top',
                  backgroundColor: COLORS.background,
                  borderTopLeftRadius: 0,
                  borderTopRightRadius: 0,
                },
              ]}
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
            <View style={boxStyle}>
              <Text style={[styles.body, !user.bio && styles.muted]}>
                {user.bio || 'No bio yet.'}
              </Text>
            </View>
            <Text
              accessibilityRole="button"
              style={[styles.linkText, { marginTop: 8 }]}
              onPress={() => setEditing(true)}
            >
              {user.bio ? 'Edit bio' : 'Add a bio'}
            </Text>
          </>
        )}
      </ProfileSection>

      <ProfileSection title="Medals">
        <View style={boxStyle}>{medals ? <MedalList medals={medals} /> : null}</View>
      </ProfileSection>
      {error && !editing ? <Text style={styles.error}>{error}</Text> : null}

      <ColorPicker
        open={picking}
        current={user.color}
        onClose={() => setPicking(false)}
        onPick={async (key) => {
          setPicking(false);
          try {
            await api.patch('/api/v1/me/color', { color: key });
            await refresh();
          } catch (e) {
            setError(e instanceof ApiRequestError ? e.message : 'Couldn’t change the color.');
          }
        }}
      />
    </View>
  );
}

const boxStyle = {
  backgroundColor: COLORS.background,
  borderWidth: 1,
  borderTopWidth: 0,
  borderColor: COLORS.border,
  borderBottomLeftRadius: 10,
  borderBottomRightRadius: 10,
  padding: 14,
} as const;

/** A section (D70): black title bar with white text, joined to the white box below. */
function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <View
        style={{
          backgroundColor: COLORS.surfaceInverse,
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 9,
        }}
      >
        <Text style={{ color: COLORS.onSurfaceInverse, fontWeight: '800', fontSize: 16 }}>
          {title}
        </Text>
      </View>
      {children}
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
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: COLORS.scrim }}
        onPress={onClose}
        accessibilityLabel="Close"
      />
      <View
        style={{
          backgroundColor: COLORS.background,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: 20,
        }}
      >
        <Text style={[styles.title, { fontSize: 20 }]}>Your color</Text>
        <Text style={[styles.muted, { marginBottom: 12 }]}>
          Used for your profile and the header and border of your posts.
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
                onPress={() => onPick(c.key)}
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 23,
                  backgroundColor: c.hex,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: selected ? 3 : 1,
                  borderColor: selected ? COLORS.text : COLORS.cardBorder,
                }}
              >
                {selected ? <Ionicons name="checkmark" size={24} color={textOn(c.hex)} /> : null}
              </Pressable>
            );
          })}
        </View>
        <Button variant="link" title="Cancel" onPress={onClose} />
      </View>
    </Modal>
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

  async function setHidePosts(hidePostsFromFriends: boolean) {
    try {
      await social.setHidePosts(hidePostsFromFriends);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t save.');
    }
  }

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

      <Text style={[styles.label, { marginTop: 20 }]}>Radius</Text>
      <Text style={[styles.muted, { marginBottom: 4 }]}>
        How far around you the feed and Places reach. To comment, vote or join a business discussion
        you need to be within {yardsLabel(CONFIG_DEFAULTS['radius.general.maxMiles'])} of it.
      </Text>
      <Options values={[...RADIUS_OPTIONS_MILES]} selected={radius} onPick={(v) => setRadius(v)} />

      {/* D76: friends see where you post unless you turn this on. */}
      <Text style={[styles.label, { marginTop: 20 }]}>Friends</Text>
      <View style={[styles.row, { justifyContent: 'space-between', gap: 12 }]}>
        <Text style={[styles.body, { flex: 1 }]}>Hide my recent posts from friends</Text>
        <Switch
          accessibilityLabel="Hide my recent posts from friends"
          value={user.hidePostsFromFriends}
          onValueChange={(v) => void setHidePosts(v)}
          {...switchColors}
        />
      </View>
      <Text style={styles.muted}>
        When off, friends see “posted near [area]” or “posted at [place]” for your posts from the
        last two weeks. They never see the post itself unless they’re nearby.
      </Text>

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
        <Row icon="add-circle-outline" label="My suggestions" href="/account/suggestions" />
        <Row icon="shield-checkmark-outline" label="Account standing" href="/account/standing" />
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
              {yardsLabel(v)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
