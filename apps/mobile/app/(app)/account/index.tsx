import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, Switch, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  BIO_MAX,
  categoryColor,
  CONFIG_DEFAULTS,
  DARK,
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
import { ensureGuide } from '@/guides/guide';
import { haptic } from '@/motion';
import { categoryIcon } from '@/places/PlaceHeader';
import { social } from '@/social/api';
import { Text, TextInput } from '@/text';
import { showAlert } from '@/dialog';
import { GUTTER, RADIUS, SPACE, TYPE } from '@/tokens';
import {
  Button,
  Card,
  FormError,
  type IconName,
  ListGroup,
  ListRow,
  Segmented,
  Sheet,
  styles,
  switchColors,
} from '@/ui';

interface Favorite {
  id: string;
  name: string;
  category: string;
}

/**
 * Account (no location needed here, D16). D79: one scrolling page, like the "you" tab of
 * most social apps: your profile card (what others see) at the top with quick actions,
 * your bio and medals, then settings in grouped cards (P4.11): email, radius, favorites,
 * account changes, safety, location, policies, sign-out and account deletion.
 */
export default function AccountScreen() {
  const { state } = useAuth();
  if (state.status === 'guest') return <GuestAccount />;
  if (state.status !== 'signedIn') return null;
  return (
    <ScrollView
      style={{ backgroundColor: DARK.page }}
      contentContainerStyle={{ padding: GUTTER, paddingBottom: 56 }}
      keyboardShouldPersistTaps="handled"
    >
      <ProfileSection />
      <Settings />
    </ScrollView>
  );
}

/** A compact action button for the profile card. */
function QuickAction({
  icon,
  label,
  onPress,
  swatch,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  swatch?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 44,
        borderRadius: RADIUS.md,
        backgroundColor: pressed ? DARK.hairline : DARK.raised,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      })}
    >
      {swatch ? (
        <View
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: swatch,
            borderWidth: 1.5,
            borderColor: DARK.text,
          }}
        />
      ) : (
        <Ionicons name={icon} size={16} color={DARK.accent} />
      )}
      <Text style={{ fontWeight: '700', fontSize: 13.5 }}>{label}</Text>
    </Pressable>
  );
}

function ProfileSection() {
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
    if (!(await ensureGuide('profile'))) return; // D104
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
      {/* Profile card: your account color as a band across the top (D69). */}
      <View style={{ borderRadius: RADIUS.lg + 4, overflow: 'hidden', backgroundColor: DARK.card }}>
        <View style={{ height: 64, backgroundColor: color.hex }} />
        <View style={{ paddingHorizontal: SPACE.lg, paddingBottom: SPACE.lg, marginTop: -44 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.md }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={user.avatarUrl ? 'Change profile photo' : 'Add a profile photo'}
              accessibilityState={{ busy: photoBusy }}
              onPress={() => void changePhoto()}
              disabled={photoBusy}
              style={{ borderRadius: 50, backgroundColor: DARK.card, padding: 4 }}
            >
              <ProfileAvatar
                name={user.username}
                url={user.avatarUrl}
                size={88}
                ringColor={color.hex}
                fill={color.hex}
              />
              {/* Camera badge: the usual "tap to change" cue. */}
              <View
                style={{
                  position: 'absolute',
                  right: 2,
                  bottom: 2,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: DARK.accent,
                  borderWidth: 3,
                  borderColor: DARK.card,
                }}
              >
                <Ionicons
                  name={photoBusy ? 'hourglass-outline' : 'camera'}
                  size={15}
                  color={DARK.onAccent}
                />
              </View>
            </Pressable>
            {/* Sits a little low so the name starts clearly below the color band. */}
            <View style={{ flex: 1, marginBottom: -6 }}>
              <Text
                numberOfLines={1}
                style={{ fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}
              >
                {user.username}
              </Text>
              <Text style={{ color: DARK.textMuted, fontWeight: '500' }}>Joined {joined}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg }}>
            <QuickAction
              icon="create-outline"
              label={user.bio ? 'Edit bio' : 'Add bio'}
              onPress={() =>
                void ensureGuide('profile').then((ok) => {
                  if (ok) setEditing(true);
                })
              }
            />
            <QuickAction
              icon="color-palette-outline"
              label="Color"
              swatch={color.hex}
              onPress={() => setPicking(true)}
            />
            <QuickAction
              icon="eye-outline"
              label="View"
              onPress={() => router.push('/account/me')}
            />
          </View>
        </View>
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
            <Text style={[TYPE.body, !user.bio && { color: DARK.textMuted }]}>
              {user.bio ||
                'No bio yet. Say a little about yourself so neighbors know who’s posting.'}
            </Text>
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
        <Text style={[TYPE.callout, { color: DARK.textMuted, marginBottom: SPACE.lg }]}>
          Shown on your profile and as the stripe on your posts.
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
                  borderColor: selected ? DARK.text : DARK.hairline,
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

function Settings() {
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

  async function setAreaStats(optOut: boolean) {
    try {
      await api.patch('/api/v1/me/area-stats', { optOut });
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
                height: 24,
                borderRadius: RADIUS.pill,
                backgroundColor: user.emailVerified ? DARK.tealSoft : DARK.accentSoft,
              }}
            >
              <Ionicons
                name={user.emailVerified ? 'checkmark-circle' : 'alert-circle'}
                size={13}
                color={user.emailVerified ? DARK.tealText : DARK.accent}
              />
              <Text
                style={{
                  fontSize: 11.5,
                  fontWeight: '800',
                  color: user.emailVerified ? DARK.tealText : DARK.accent,
                }}
              >
                {user.emailVerified ? 'Confirmed' : 'Not confirmed'}
              </Text>
            </View>
          }
        />
      </ListGroup>
      {!user.emailVerified ? <EmailCodeCard email={user.email} /> : null}

      <ListGroup
        title="Radius"
        footer={`How far around you the feed and Places reach. To comment, vote or join a place discussion you need to be within ${yardsLabel(CONFIG_DEFAULTS['radius.general.maxMiles'])} of it.`}
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

      {/* D76: friends see where you post unless you turn this on. */}
      <ListGroup
        title="Friends"
        footer="When off, friends see “posted near [area]” or “posted at [place]” for your posts from the last 3 days. They never see the post itself unless they’re nearby."
      >
        <ListRow
          icon="eye-off-outline"
          label="Hide my posts from friends"
          detail={user.hidePostsFromFriends ? 'On: friends don’t see where you post' : 'Off'}
          right={
            <Switch
              accessibilityLabel="Hide my recent posts from friends"
              value={user.hidePostsFromFriends}
              onValueChange={(v) => void setHidePosts(v)}
              {...switchColors}
            />
          }
        />
      </ListGroup>

      {/* D116: the anonymous area statistics, on unless you turn them off. */}
      <ListGroup
        title="Area statistics"
        footer="No personal data is collected and no one’s location is tracked. JaxSide only counts the total number of people who visited each area."
      >
        <ListRow
          icon="stats-chart-outline"
          label="Include me in area statistics"
          detail={user.areaStatsOptOut ? 'Off: you aren’t counted' : 'On'}
          right={
            <Switch
              accessibilityLabel="Include me in the anonymous area statistics"
              value={!user.areaStatsOptOut}
              onValueChange={(v) => void setAreaStats(!v)}
              {...switchColors}
            />
          }
        />
        <ListRow
          icon="information-circle-outline"
          label="See details"
          onPress={() =>
            showAlert(
              'Area statistics',
              [
                'When you open JaxSide, we note that someone used the app in your ZIP code that day, and in which part of the day (morning, afternoon, evening or night). That’s all: never your exact location, your route, or who you are.',
                'The note is under a code that can’t be traced back to you. It’s deleted after the month, and the code’s key is destroyed. Only totals are kept, like “120 people in 32205 on Saturday,” and groups under 10 people are never shown.',
                'The totals show which parts of Jacksonville are busy, and may be shared with local businesses as totals only. Turn this off any time; you won’t be counted.',
              ].join('\n\n'),
              undefined,
              { icon: 'stats-chart-outline' },
            )
          }
        />
      </ListGroup>

      <ListGroup
        title="Favorite places"
        footer={
          favorites.length === 0 ? 'Tap “Save to favorites” on a place to keep it here.' : undefined
        }
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

      <ListGroup title="Your account">
        <ListRow icon="at" label="Username" value={user.username} href="/account/username" />
        <ListRow icon="mail-outline" label="Change email" href="/account/email" />
        <ListRow icon="key-outline" label="Change password" href="/account/password" />
        <ListRow icon="ban-outline" label="Blocked users" href="/account/blocked" />
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

      <Help />
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
      style={{ backgroundColor: DARK.page }}
      contentContainerStyle={{ padding: GUTTER, paddingBottom: 56 }}
    >
      <Card style={{ alignItems: 'center', padding: SPACE.xl, gap: SPACE.sm }}>
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: DARK.accentSoft,
          }}
        >
          <Ionicons name="person-outline" size={36} color={DARK.accent} />
        </View>
        <Text accessibilityRole="header" style={[TYPE.title, { textAlign: 'center' }]}>
          You’re browsing as a guest
        </Text>
        <Text style={[TYPE.callout, { color: DARK.textMuted, textAlign: 'center' }]}>
          Guests can browse posts and comments nearby. Create a free account to post, comment, vote,
          report, join place discussions and keep a profile.
        </Text>
        <Button
          title="Sign up or sign in"
          icon="person-add-outline"
          onPress={() => void signOut()}
          style={{ alignSelf: 'stretch', marginTop: SPACE.md }}
        />
      </Card>
      <ListGroup
        title="Guest session"
        footer={`Your guest session ends after ${CONFIG_DEFAULTS['guest.inactivityDays']} days without use. Using JaxSide resets the clock.`}
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
      <Help />
      <LocationHelp />
      <Policies />
    </ScrollView>
  );
}

/** D90: Contact us (support ticket or general message), for people and guests. */
function Help() {
  return (
    <ListGroup title="Help">
      <ListRow icon="school-outline" label="Community rules" href="/account/rules" />
      <ListRow icon="chatbubbles-outline" label="Contact us" href="/account/contact" />
    </ListGroup>
  );
}

/** P4.11: location-permission guidance (D16: foreground only, asked once). */
function LocationHelp() {
  return (
    <ListGroup
      title="Location"
      footer="JaxSide uses your location only while the app is open, to show and verify conversations near you. It never tracks you in the background."
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
