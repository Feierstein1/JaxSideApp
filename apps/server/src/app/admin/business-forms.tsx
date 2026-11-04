'use client';

import { useState } from 'react';
import { COLORS } from '@jax/shared';
import { adminFetch, ui } from './admin-ui';

/** B1.7: suspend, lift, revoke or reset a business login (all audited). */
export function BusinessActions({
  id,
  status,
  kind,
  hasPicture = false,
}: {
  id: string;
  status: string;
  kind: 'owner' | 'employee';
  /** D189: the login has a profile picture (Remove picture). */
  hasPicture?: boolean;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [temp, setTemp] = useState<string>();

  async function act(
    action: 'suspend' | 'unsuspend' | 'revoke' | 'reset-password' | 'remove-picture',
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
        {hasPicture ? (
          <button
            style={ui.buttonSecondary}
            disabled={busy}
            onClick={() =>
              act(
                'remove-picture',
                'Remove this login’s profile picture? It stops showing everywhere (kept as evidence).',
              )
            }
          >
            Remove picture
          </button>
        ) : null}
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

type PlanFields = {
  id?: string;
  name: string;
  liveAdLimit: number;
  priceCents: number | null;
  includesInsights: boolean;
  active: boolean;
};

/** B3.1: create a plan, or (with `plan`) edit one. */
export function PlanForm({ plan }: { plan?: PlanFields }) {
  const [open, setOpen] = useState(!plan);
  const [name, setName] = useState(plan?.name ?? '');
  const [liveAdLimit, setLimit] = useState(plan?.liveAdLimit ?? 1);
  const [price, setPrice] = useState(
    plan?.priceCents === null || plan?.priceCents === undefined
      ? ''
      : (plan.priceCents / 100).toFixed(2),
  );
  const [includesInsights, setInsights] = useState(plan?.includesInsights ?? false);
  const [active, setActive] = useState(plan?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!open) {
    return (
      <button style={ui.buttonSecondary} onClick={() => setOpen(true)}>
        Edit
      </button>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(undefined);
        try {
          const priceCents = price.trim() === '' ? null : Math.round(Number(price) * 100);
          if (priceCents !== null && !Number.isFinite(priceCents))
            throw new Error('Enter a price like 29.00, or leave it empty.');
          await adminFetch(plan?.id ? `/api/v1/admin/plans/${plan.id}` : '/api/v1/admin/plans', {
            method: 'POST',
            body: { name, liveAdLimit, priceCents, includesInsights, active },
          });
          window.location.reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
          setBusy(false);
        }
      }}
    >
      <label style={ui.label}>
        Name
        <input
          style={ui.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          required
        />
      </label>
      <label style={ui.label}>
        Ads live at once (0–3)
        <input
          style={ui.input}
          type="number"
          min={0}
          max={3}
          value={liveAdLimit}
          onChange={(e) => setLimit(Number(e.target.value))}
        />
      </label>
      <label style={ui.label}>
        Monthly price in dollars (empty = not set yet)
        <input
          style={ui.input}
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>
      <label style={{ display: 'block', margin: '8px 0' }}>
        <input
          type="checkbox"
          checked={includesInsights}
          onChange={(e) => setInsights(e.target.checked)}
        />{' '}
        Includes area counts (insights)
      </label>
      <label style={{ display: 'block', margin: '8px 0' }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />{' '}
        Offered to businesses
      </label>
      <button style={ui.button} disabled={busy}>
        {plan ? 'Save' : 'Add plan'}
      </button>
      {error ? (
        <p role="alert" style={ui.error}>
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** B3.1: give the business a plan for free, or end its current one. */
export function CompPlanForm({
  accountId,
  plans,
  hasPlan,
}: {
  accountId: string;
  plans: { id: string; name: string }[];
  hasPlan: boolean;
}) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? '');
  const [endsAt, setEndsAt] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function send(path: string, body: object, confirm: string) {
    if (!window.confirm(confirm)) return;
    setBusy(true);
    setError(undefined);
    try {
      await adminFetch(path, { method: 'POST', body });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }
  if (plans.length === 0) {
    return (
      <p style={ui.muted}>
        No plans yet. <a href="/admin/businesses/plans">Add one</a> first.
      </p>
    );
  }
  return (
    <div>
      <label style={ui.label}>
        Plan
        <select style={ui.input} value={planId} onChange={(e) => setPlanId(e.target.value)}>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label style={ui.label}>
        Free until (empty = until you end it)
        <input
          style={ui.input}
          type="date"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
        />
      </label>
      <label style={ui.label}>
        Note (kept in the audit log)
        <input
          style={ui.input}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          style={ui.button}
          disabled={busy}
          onClick={() =>
            send(
              `/api/v1/admin/businesses/${accountId}/subscription`,
              {
                planId,
                // End of that day, Jacksonville time (EST offset; a few hours either way is fine).
                ...(endsAt ? { endsAt: `${endsAt}T23:59:00-05:00` } : {}),
                ...(note.trim() ? { note: note.trim() } : {}),
              },
              hasPlan ? 'Replace the current plan with this free one?' : 'Give this plan for free?',
            )
          }
        >
          Give plan for free
        </button>
        {hasPlan ? (
          <button
            style={ui.buttonSecondary}
            disabled={busy}
            onClick={() =>
              send(
                `/api/v1/admin/businesses/${accountId}/subscription/end`,
                note.trim() ? { note: note.trim() } : {},
                'End the current plan now? Their ads stop running.',
              )
            }
          >
            End current plan
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" style={ui.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * D191: a strike on a business login that isn't tied to a report (e.g. a bad profile
 * picture). The message goes to their bell on the website; the next ladder step applies.
 */
export function BusinessStrikeForm({ id, step }: { id: string; step: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function send() {
    if (step !== 'warning' && !window.confirm(`This is their next strike: a ${step}. Continue?`))
      return;
    setBusy(true);
    setError(undefined);
    try {
      await adminFetch(`/api/v1/admin/businesses/${id}/strikes`, {
        method: 'POST',
        body: {
          action: 'strike',
          reason: reason.trim(),
          ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}),
        },
      });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button style={ui.buttonSecondary} onClick={() => setOpen(true)}>
        Give a strike ({step})
      </button>
    );
  }
  return (
    <div style={{ maxWidth: 520 }}>
      <label style={ui.label}>
        Message (shown to them in their bell and on Account standing)
        <textarea
          style={{ ...ui.input, minHeight: 70, fontFamily: 'inherit' }}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
        />
      </label>
      <label style={ui.label}>
        Internal note (admins only)
        <input
          style={ui.input}
          value={internalNote}
          onChange={(e) => setInternalNote(e.target.value)}
          maxLength={2000}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button style={ui.button} disabled={busy || reason.trim().length < 3} onClick={send}>
          Send {step}
        </button>
        <button style={ui.buttonSecondary} disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error ? (
        <p role="alert" style={ui.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
