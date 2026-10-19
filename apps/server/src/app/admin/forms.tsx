'use client';

import { useState } from 'react';
import { COLORS } from '@jax/shared';
import { adminFetch, ui } from './admin-ui';

/** Moderator forms (P5.14). Each posts to the admin API with the CSRF header. */

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setError(undefined);
    setDone(undefined);
    try {
      setDone((await fn()) ?? 'Done.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, done, run };
}

const textarea = { ...ui.input, minHeight: 70, fontFamily: 'inherit' };

export function CaseDecision({
  type,
  id,
  held,
  removed,
  isProfile,
  hasAuthor,
}: {
  type: string;
  id: string;
  held: boolean;
  removed: boolean;
  isProfile: boolean;
  hasAuthor: boolean;
}) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [strike, setStrike] = useState(false);
  const { busy, error, done, run } = useSubmit();

  const decide = (decision: string) =>
    run(async () => {
      if (
        decision === 'escalate' &&
        !confirm(
          'Escalate as child safety? This hides it, preserves it and puts the author on legal hold. Report it to NCMEC (CyberTipline) as required by law.',
        )
      )
        return 'Cancelled.';
      const r = await adminFetch<{ strike: { action: string } | null }>(
        `/api/v1/admin/cases/${type}/${id}`,
        {
          method: 'POST',
          body: { decision, reason, internalNote: note || undefined, strike: strike || undefined },
        },
      );
      setTimeout(() => (window.location.href = '/admin/reports'), 800);
      return r.strike ? `Done. Author got a ${r.strike.action.toLowerCase()}.` : 'Done.';
    });

  return (
    <div style={ui.card}>
      <h2 style={{ marginTop: 0 }}>Decision</h2>
      <label style={ui.label}>
        Reason (recorded; shown to the author if they get a strike)
        <textarea
          style={textarea}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
        />
      </label>
      <label style={ui.label}>
        Internal note (admins only)
        <textarea
          style={textarea}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
        />
      </label>
      {hasAuthor ? (
        <label style={{ display: 'block', margin: '4px 0 14px' }}>
          <input type="checkbox" checked={strike} onChange={(e) => setStrike(e.target.checked)} />{' '}
          Also give the author a strike (warning → 1 day → 7 days → ban)
        </label>
      ) : null}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {!isProfile && !removed ? (
          <button style={ui.buttonDanger} disabled={busy} onClick={() => decide('remove')}>
            Remove
          </button>
        ) : null}
        {!isProfile && (held || removed) ? (
          <button style={ui.button} disabled={busy} onClick={() => decide('approve')}>
            {held ? 'Approve (publish)' : 'Restore'}
          </button>
        ) : null}
        <button style={ui.buttonSecondary} disabled={busy} onClick={() => decide('dismiss')}>
          Dismiss reports
        </button>
        <button
          style={{ ...ui.buttonSecondary, color: COLORS.error, borderColor: COLORS.error }}
          disabled={busy}
          onClick={() => decide('escalate')}
        >
          Child safety: escalate
        </button>
      </div>
      {error ? (
        <p role="alert" style={ui.error}>
          {error}
        </p>
      ) : null}
      {done ? <p role="status">{done}</p> : null}
    </div>
  );
}

export function UserActions({ userId, status }: { userId: string; status: string }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [hours, setHours] = useState('24');
  const { busy, error, done, run } = useSubmit();

  const act = (action: string, extra: Record<string, unknown> = {}) =>
    run(async () => {
      if (action === 'ban' && !confirm('Permanently ban this account and the phones it used?'))
        return 'Cancelled.';
      await adminFetch(`/api/v1/admin/users/${userId}/actions`, {
        method: 'POST',
        body: {
          action,
          reason,
          ...(action === 'void' ? {} : { internalNote: note || undefined }),
          ...extra,
        },
      });
      setTimeout(() => window.location.reload(), 600);
      return 'Done.';
    });

  return (
    <div style={ui.card}>
      <h2 style={{ marginTop: 0 }}>Actions</h2>
      <label style={ui.label}>
        Reason (shown to the person for strikes, suspensions and bans)
        <textarea
          style={textarea}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
        />
      </label>
      <label style={ui.label}>
        Internal note (admins only)
        <textarea
          style={textarea}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
        />
      </label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={ui.button} disabled={busy} onClick={() => act('strike')}>
          Strike (next step)
        </button>
        <span>
          <input
            style={{ ...ui.input, display: 'inline', width: 70, margin: 0 }}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            inputMode="numeric"
          />{' '}
          h{' '}
          <button
            style={ui.buttonSecondary}
            disabled={busy}
            onClick={() => act('suspend', { hours: Number(hours) })}
          >
            Suspend
          </button>
        </span>
        <button style={ui.buttonDanger} disabled={busy} onClick={() => act('ban')}>
          Ban
        </button>
        {status === 'SUSPENDED' || status === 'BANNED' ? (
          <button style={ui.buttonSecondary} disabled={busy} onClick={() => act('lift')}>
            Lift {status === 'BANNED' ? 'ban' : 'suspension'}
          </button>
        ) : null}
        <button style={ui.buttonSecondary} disabled={busy} onClick={() => act('note')}>
          Add note only
        </button>
      </div>
      {error ? (
        <p role="alert" style={ui.error}>
          {error}
        </p>
      ) : null}
      {done ? <p role="status">{done}</p> : null}
    </div>
  );
}

export function VoidStrike({ userId, strikeId }: { userId: string; strikeId: string }) {
  const { busy, error, run } = useSubmit();
  return (
    <>
      <button
        style={{ ...ui.buttonSecondary, padding: '2px 8px', fontSize: 12 }}
        disabled={busy}
        onClick={() =>
          run(async () => {
            const reason = prompt('Why cancel this strike? (recorded)');
            if (!reason) return 'Cancelled.';
            await adminFetch(`/api/v1/admin/users/${userId}/actions`, {
              method: 'POST',
              body: { action: 'void', strikeId, reason },
            });
            window.location.reload();
          })
        }
      >
        Cancel strike
      </button>
      {error ? <span style={ui.error}> {error}</span> : null}
    </>
  );
}

export function AppealDecision({ appealId }: { appealId: string }) {
  const [note, setNote] = useState('');
  const { busy, error, done, run } = useSubmit();
  const decide = (accept: boolean) =>
    run(async () => {
      await adminFetch(`/api/v1/admin/appeals/${appealId}`, {
        method: 'POST',
        body: { accept, note },
      });
      setTimeout(() => window.location.reload(), 600);
      return accept ? 'Accepted: strike cancelled.' : 'Rejected.';
    });
  return (
    <div style={{ marginTop: 10 }}>
      <label style={ui.label}>
        Note to the person
        <textarea
          style={textarea}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
        />
      </label>
      <button style={ui.button} disabled={busy} onClick={() => decide(true)}>
        Accept (cancel strike)
      </button>{' '}
      <button style={ui.buttonSecondary} disabled={busy} onClick={() => decide(false)}>
        Reject
      </button>
      {error ? (
        <p role="alert" style={ui.error}>
          {error}
        </p>
      ) : null}
      {done ? <p role="status">{done}</p> : null}
    </div>
  );
}

/**
 * D90: a Contact us message: resolve / reopen, and (only if the person allowed it) show
 * their account email to reply. Showing it is audited.
 */
export function ContactActions({
  id,
  resolved,
  canReply,
}: {
  id: string;
  resolved: boolean;
  canReply: boolean;
}) {
  const [email, setEmail] = useState<string | null>();
  const { busy, error, done, run } = useSubmit();
  const setResolved = (value: boolean) =>
    run(async () => {
      await adminFetch(`/api/v1/admin/contact/${id}`, {
        method: 'POST',
        body: { resolved: value },
      });
      setTimeout(() => window.location.reload(), 500);
      return value ? 'Marked resolved.' : 'Opened again.';
    });
  const showEmail = () =>
    run(async () => {
      const r = await adminFetch<{ email: string | null }>(
        `/api/v1/admin/contact/${id}/reply-email`,
      );
      setEmail(r.email);
      return r.email ? 'Shown (this is logged).' : 'No address available.';
    });
  return (
    <div>
      {canReply ? (
        email ? (
          <p>
            Reply to: <a href={`mailto:${email}`}>{email}</a>
          </p>
        ) : (
          <button style={ui.buttonSecondary} disabled={busy} onClick={showEmail}>
            Show reply email
          </button>
        )
      ) : (
        <p style={{ color: COLORS.textMuted }}>The sender didn’t ask for a reply by email.</p>
      )}{' '}
      <button style={ui.button} disabled={busy} onClick={() => setResolved(!resolved)}>
        {resolved ? 'Open again' : 'Mark resolved'}
      </button>
      {error ? (
        <p role="alert" style={ui.error}>
          {error}
        </p>
      ) : null}
      {done ? <p role="status">{done}</p> : null}
    </div>
  );
}
