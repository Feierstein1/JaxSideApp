'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { COLORS } from '@jax/shared';
import { TEXT } from '@/text';
import { post } from '../../../client';
import { ui } from '../../../ui';

type Role = 'MANAGER' | 'STAFF';

/** Shown once after a new login or a reset: the Owner passes it on in person. */
function TemporaryPassword({ username, password }: { username: string; password: string }) {
  return (
    <div
      role="status"
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 8,
        background: COLORS.accentSoft,
        color: COLORS.text,
      }}
    >
      <p style={{ marginTop: 0 }}>{TEXT.team.tempIntro}</p>
      <p>
        {TEXT.team.username}: <code>{username}</code>
        <br />
        {TEXT.team.tempPassword}: <code>{password}</code>
      </p>
      <p style={{ marginBottom: 0 }}>{TEXT.team.tempNote}</p>
    </div>
  );
}

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : TEXT.common.failed);
    } finally {
      setBusy(false);
    }
  }
  const errorLine = error ? (
    <p role="alert" style={ui.error}>
      {error}
    </p>
  ) : null;
  return { run, busy, errorLine };
}

export function AddMemberForm({ placeId }: { placeId: string }) {
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<Role>('STAFF');
  const [staffName, setStaffName] = useState('');
  const [made, setMade] = useState<{ username: string; password: string }>();
  const { run, busy, errorLine } = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const r = await post<{ temporaryPassword: string | null }>(`/api/places/${placeId}/team`, {
        username,
        role,
        ...(staffName.trim() ? { staffName: staffName.trim() } : {}),
      });
      setMade(r.temporaryPassword ? { username, password: r.temporaryPassword } : undefined);
      setUsername('');
      setStaffName('');
    });
  };

  return (
    <form onSubmit={submit}>
      <p style={ui.muted}>{TEXT.team.addHelp}</p>
      <label style={ui.label}>
        {TEXT.team.username}
        <input
          style={ui.input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
          required
        />
      </label>
      <label style={ui.label}>
        {TEXT.team.role}
        <select style={ui.input} value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="STAFF">{TEXT.roles.STAFF}</option>
          <option value="MANAGER">{TEXT.roles.MANAGER}</option>
        </select>
      </label>
      <p style={ui.muted}>{TEXT.team.roleHelp}</p>
      <label style={ui.label}>
        {TEXT.team.staffName}
        <input
          style={ui.input}
          value={staffName}
          onChange={(e) => setStaffName(e.target.value)}
          maxLength={30}
        />
      </label>
      {errorLine}
      <button type="submit" disabled={busy} style={ui.primary}>
        {busy ? TEXT.common.saving : TEXT.team.add}
      </button>
      {made ? <TemporaryPassword username={made.username} password={made.password} /> : null}
    </form>
  );
}

export function MemberActions({
  placeId,
  accountId,
  role,
  staffName,
}: {
  placeId: string;
  accountId: string;
  role: Role;
  staffName: string | null;
}) {
  const [name, setName] = useState(staffName ?? '');
  const [reset, setReset] = useState<string>();
  const { run, busy, errorLine } = useAction();
  const send = (body: object) =>
    post<{ temporaryPassword: string | null }>(`/api/places/${placeId}/team/${accountId}`, body);

  return (
    <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          style={ui.secondary}
          disabled={busy}
          onClick={() =>
            run(async () => {
              await send({ action: 'role', role: role === 'STAFF' ? 'MANAGER' : 'STAFF' });
            })
          }
        >
          {role === 'STAFF' ? TEXT.team.makeManager : TEXT.team.makeStaff}
        </button>
        <button
          type="button"
          style={ui.secondary}
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await send({ action: 'reset-password' });
              setReset(r.temporaryPassword ?? undefined);
            })
          }
        >
          {TEXT.team.resetPassword}
        </button>
        <button
          type="button"
          style={ui.secondary}
          disabled={busy}
          onClick={() => {
            if (window.confirm(TEXT.team.removeConfirm)) {
              void run(async () => void (await send({ action: 'remove' })));
            }
          }}
        >
          {TEXT.team.remove}
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await send({ action: 'staff-name', staffName: name.trim() || null });
          });
        }}
        style={{ display: 'flex', gap: 8 }}
      >
        <input
          style={{ ...ui.input, marginTop: 0 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          placeholder={TEXT.team.staffName}
          aria-label={TEXT.team.staffName}
        />
        <button type="submit" style={ui.secondary} disabled={busy}>
          {TEXT.common.save}
        </button>
      </form>
      {errorLine}
      {reset ? <TemporaryPassword username={TEXT.team.same} password={reset} /> : null}
    </div>
  );
}
