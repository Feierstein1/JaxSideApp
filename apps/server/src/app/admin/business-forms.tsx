'use client';

import { useState } from 'react';
import { COLORS } from '@jax/shared';
import { adminFetch, ui } from './admin-ui';

/** B1.7: suspend, lift, revoke or reset a business login (all audited). */
export function BusinessActions({
  id,
  status,
  kind,
}: {
  id: string;
  status: string;
  kind: 'owner' | 'employee';
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [temp, setTemp] = useState<string>();

  async function act(
    action: 'suspend' | 'unsuspend' | 'revoke' | 'reset-password',
    confirm: string,
  ) {
    if (!window.confirm(confirm)) return;
    setBusy(true);
    setError(undefined);
    setDone(undefined);
    try {
      const r = await adminFetch<{ temporaryPassword: string | null }>(
        `/api/v1/admin/businesses/${id}`,
        { method: 'POST', body: { action, ...(note.trim() ? { note: note.trim() } : {}) } },
      );
      if (r.temporaryPassword) {
        setTemp(r.temporaryPassword);
        setDone(
          'Password reset. Give them the temporary password; they choose a new one at sign-in.',
        );
      } else {
        setDone('Done.');
        setTimeout(() => window.location.reload(), 600);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'REVOKED') return <p style={ui.muted}>Revoked: nothing more can be done.</p>;
  const whole = kind === 'owner' ? ' and every staff login it made' : '';
  return (
    <div>
      <label style={ui.label}>
        Note (kept in the audit log)
        <input
          style={ui.input}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {status === 'SUSPENDED' ? (
          <button
            style={ui.button}
            disabled={busy}
            onClick={() => act('unsuspend', `Lift the suspension of this account${whole}?`)}
          >
            Lift suspension
          </button>
        ) : (
          <button
            style={ui.buttonSecondary}
            disabled={busy}
            onClick={() =>
              act(
                'suspend',
                `Suspend this account${whole}? They're signed out and can't sign in until you lift it.`,
              )
            }
          >
            Suspend
          </button>
        )}
        <button
          style={ui.buttonSecondary}
          disabled={busy}
          onClick={() =>
            act(
              'reset-password',
              'Reset this login’s password? Their sessions end and two-step sign-in is turned off.',
            )
          }
        >
          Reset password
        </button>
        <button
          style={ui.buttonSecondary}
          disabled={busy}
          onClick={() =>
            act(
              'revoke',
              `Permanently revoke this account${whole}? They lose every place. This can’t be undone.`,
            )
          }
        >
          Revoke permanently
        </button>
      </div>
      {error ? (
        <p role="alert" style={ui.error}>
          {error}
        </p>
      ) : null}
      {done ? <p role="status">{done}</p> : null}
      {temp ? (
        <p
          style={{
            background: COLORS.accentSoft,
            color: COLORS.text,
            padding: 10,
            borderRadius: 8,
          }}
        >
          Temporary password (shown once): <code>{temp}</code>
        </p>
      ) : null}
    </div>
  );
}

/** B1.7: move a place to another owner account (by its business email). */
export function MoveOwnerForm({ placeId }: { placeId: string }) {
  const [open, setOpen] = useState(false);
  const [toEmail, setToEmail] = useState('');
  const [removeOldTeam, setRemoveOldTeam] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!open) {
    return (
      <button style={ui.buttonSecondary} onClick={() => setOpen(true)}>
        Move to another owner…
      </button>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!window.confirm(`Move this place to ${toEmail}?`)) return;
        setBusy(true);
        setError(undefined);
        try {
          await adminFetch(`/api/v1/admin/businesses/places/${placeId}/owner`, {
            method: 'POST',
            body: { toEmail, removeOldTeam },
          });
          window.location.reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        style={ui.input}
        type="email"
        placeholder="New owner’s business email"
        value={toEmail}
        onChange={(e) => setToEmail(e.target.value)}
        required
      />
      <label style={{ display: 'block', margin: '6px 0' }}>
        <input
          type="checkbox"
          checked={removeOldTeam}
          onChange={(e) => setRemoveOldTeam(e.target.checked)}
        />{' '}
        Also remove the old owner’s staff from this place
      </label>
      <button style={ui.button} disabled={busy}>
        Move
      </button>
      {error ? (
        <p role="alert" style={ui.error}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
