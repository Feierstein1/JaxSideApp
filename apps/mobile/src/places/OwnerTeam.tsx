import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK, STAFF_NAME_MAX } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { showAlert } from '@/dialog';
import { haptic } from '@/motion';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { Button, Field, FormError, SectionTitle } from '@/ui';

interface Member {
  claimId: string;
  username: string;
  staffName: string | null;
  primary: boolean;
  since: string;
  isMe: boolean;
}

/**
 * D157: the place's owner team. Everyone on it posts and comments here as "The Owner" (with
 * their staff name if set), never their username. The primary owner adds people by username
 * and removes them; anyone on the team can set their own staff name. Usernames are only
 * shown to the team itself.
 */
export function OwnerTeam({ placeId }: { placeId: string }) {
  const [team, setTeam] = useState<Member[]>();
  const [error, setError] = useState<string>();
  const [username, setUsername] = useState('');
  const [staffName, setStaffName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string>();
  const [editName, setEditName] = useState('');
  const base = `/api/v1/places/${placeId}/owner-team`;

  const load = useCallback(async () => {
    try {
      setTeam((await api.get<{ team: Member[] }>(base)).team);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load the team.');
    }
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  const me = team?.find((m) => m.isMe);
  const run = async (fn: () => Promise<{ team: Member[] }>) => {
    setBusy(true);
    setError(undefined);
    try {
      setTeam((await fn()).team);
      haptic.success();
      return true;
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  async function add() {
    const ok = await run(() =>
      api.post(base, { username: username.trim(), ...(staffName.trim() ? { staffName } : {}) }),
    );
    if (ok) {
      setUsername('');
      setStaffName('');
    }
  }
  function remove(m: Member) {
    showAlert(
      `Remove @${m.username}?`,
      'They’ll stop posting as The Owner here. Their earlier posts stay, as The Owner.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void run(() => api.delete(`${base}/${m.claimId}`)),
        },
      ],
    );
  }
  async function rename(m: Member) {
    const ok = await run(() =>
      api.patch(`${base}/${m.claimId}`, { staffName: editName.trim() || null }),
    );
    if (ok) setEditing(undefined);
  }

  if (!team) return error ? <FormError>{error}</FormError> : null;
  return (
    <View style={{ marginTop: SPACE.lg }}>
      <SectionTitle>Owner team</SectionTitle>
      <Text style={[TYPE.callout, { color: DARK.textMuted, marginBottom: SPACE.sm }]}>
        Everyone here posts and comments in this place as “The Owner”, with their staff name if they
        have one. People never see your usernames.
      </Text>
      <View style={{ borderRadius: RADIUS.lg, backgroundColor: DARK.card, overflow: 'hidden' }}>
        {team.map((m, i) => (
          <View
            key={m.claimId}
            style={{
              padding: SPACE.md,
              gap: 8,
              borderTopWidth: i ? 1 : 0,
              borderTopColor: DARK.hairline,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <Ionicons
                name={m.primary ? 'shield-checkmark' : 'person'}
                size={18}
                color={DARK.accent}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800' }}>
                  {m.staffName ? `The Owner · ${m.staffName}` : 'The Owner'}
                </Text>
                <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
                  @{m.username}
                  {m.primary ? ' · primary owner' : ''}
                  {m.isMe ? ' · you' : ''}
                </Text>
              </View>
              {m.isMe || me?.primary ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Change ${m.isMe ? 'your' : `@${m.username}'s`} staff name`}
                  onPress={() => {
                    setEditing(m.claimId);
                    setEditName(m.staffName ?? '');
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="create-outline" size={20} color={DARK.accent} />
                </Pressable>
              ) : null}
              {me?.primary && !m.primary ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove @${m.username}`}
                  onPress={() => remove(m)}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={20} color={DARK.error} />
                </Pressable>
              ) : null}
            </View>
            {editing === m.claimId ? (
              <View style={{ gap: 6 }}>
                <Field
                  label="Staff name (optional)"
                  value={editName}
                  onChangeText={setEditName}
                  maxLength={STAFF_NAME_MAX}
                  placeholder="e.g. Sarah"
                />
                <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                  <Button size="sm" title="Save" busy={busy} onPress={() => void rename(m)} />
                  <Button
                    size="sm"
                    variant="secondary"
                    title="Cancel"
                    onPress={() => setEditing(undefined)}
                  />
                </View>
              </View>
            ) : null}
          </View>
        ))}
      </View>
      {me?.primary ? (
        <View style={{ marginTop: SPACE.md, gap: 6 }}>
          <Text style={{ fontWeight: '800' }}>Add someone</Text>
          <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
            They need a JaxSide account with a confirmed email. They’ll post here as The Owner.
          </Text>
          <Field
            label="Their username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
          />
          <Field
            label="Staff name (optional, shown instead of the username)"
            value={staffName}
            onChangeText={setStaffName}
            maxLength={STAFF_NAME_MAX}
            placeholder="e.g. Sarah"
          />
          <Button
            title="Add to the team"
            busy={busy}
            disabled={username.trim().length < 3}
            onPress={() => void add()}
          />
        </View>
      ) : null}
      <FormError>{error}</FormError>
    </View>
  );
}
