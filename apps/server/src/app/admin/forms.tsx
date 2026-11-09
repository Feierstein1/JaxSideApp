'use client';

import { useState } from 'react';
import { COLORS, SUBMIT_CATEGORIES } from '@jax/shared';
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
  const [notifyAuthor, setNotifyAuthor] = useState(false);
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
          body: {
            decision,
            reason,
            internalNote: note || undefined,
            strike: strike || undefined,
            // D205: only a removal tells the author.
            notifyAuthor: (decision === 'remove' && notifyAuthor) || undefined,
          },
        },
      );
      setTimeout(() => (window.location.href = '/admin/reports'), 800);
      return r.strike ? `Done. Author got a ${r.strike.action.toLowerCase()}.` : 'Done.';
    });

  return (
    <div style={ui.card}>
      <h2 style={{ marginTop: 0 }}>Decision</h2>
      <label style={ui.label}>
        Reason (optional, except to escalate; shown to the author with a strike or removal notice)
        <textarea
          style={textarea}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
        />
      </label>
      <label style={ui.label}>
        Internal note (optional, admins only)
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
          Also give the author a strike (warning → 1 day → 7 days → ban; they’re told in the app)
        </label>
      ) : null}
      {hasAuthor && !isProfile && !removed ? (
        <label style={{ display: 'block', margin: '4px 0 14px' }}>
          <input
            type="checkbox"
            checked={notifyAuthor}
            onChange={(e) => setNotifyAuthor(e.target.checked)}
          />{' '}
          Tell the author it was removed, with the reason (Remove only)
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
        Reason (shown to the person for strikes, suspensions and bans; optional for those)
        <textarea
          style={textarea}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
        />
      </label>
      <label style={ui.label}>
        Internal note (optional, admins only)
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

/**
 * "Notify" on one report about this person: a strike tied to the report, so they see the
 * reason on Account standing. It's the next step of the ladder, which the button names.
 */
export function NotifyForReport({
  userId,
  reportId,
  suggested,
  step,
  url = `/api/v1/admin/users/${userId}/actions`,
}: {
  userId: string;
  reportId: string;
  suggested: string;
  /** e.g. "warning", "24 h suspension", "ban". */
  step: string;
  /** D191: a business login's strikes route instead of a person's actions. */
  url?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(suggested);
  const { busy, error, done, run } = useSubmit();
  const send = () =>
    run(async () => {
      if (step !== 'warning' && !confirm(`This is their next strike: a ${step}. Continue?`))
        return 'Cancelled.';
      await adminFetch(url, {
        method: 'POST',
        body: { action: 'strike', reason, reportId },
      });
      setTimeout(() => window.location.reload(), 600);
      return 'Sent.';
    });
  if (!open) {
    return (
      <button style={ui.buttonSecondary} onClick={() => setOpen(true)}>
        Notify ({step})
      </button>
    );
  }
  return (
    <div style={{ minWidth: 260 }}>
      <label style={ui.label}>
        Message (shown to them on Account standing)
        <textarea
          style={textarea}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
        />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={ui.button} disabled={busy} onClick={send}>
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
      {done ? <p role="status">{done}</p> : null}
    </div>
  );
}

/**
 * D141: the ADMIN badge under someone's name on posts, comments and their profile. Only a
 * label for the community; admin access is still only given with the promote command.
 */
export function StaffBadge({ userId, on }: { userId: string; on: boolean }) {
  const [reason, setReason] = useState('');
  const { busy, error, done, run } = useSubmit();
  const toggle = () =>
    run(async () => {
      await adminFetch(`/api/v1/admin/users/${userId}/actions`, {
        method: 'POST',
        body: { action: 'staffBadge', on: !on, reason },
      });
      setTimeout(() => window.location.reload(), 600);
      return on ? 'Badge removed.' : 'Badge added.';
    });
  return (
    <div style={ui.card}>
      <h2 style={{ marginTop: 0 }}>ADMIN badge</h2>
      <p style={ui.muted}>
        {on
          ? 'Their posts, comments and profile show ADMIN under the name.'
          : 'Shows ADMIN under their name on posts, comments and their profile, so people know a staff member is speaking. It gives no access to this portal.'}
      </p>
      <label style={ui.label}>
        Reason (kept in the audit log)
        <input style={ui.input} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button style={on ? ui.buttonSecondary : ui.button} disabled={busy} onClick={toggle}>
        {on ? 'Remove ADMIN badge' : 'Show ADMIN badge'}
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

/** D144: lock or unlock voting on a place, or clear its votes (asks for a reason). */
export function PlaceRatingControls({ placeId, locked }: { placeId: string; locked: boolean }) {
  const { busy, error, done, run } = useSubmit();
  const act = (action: 'lock' | 'unlock' | 'clear') =>
    run(async () => {
      if (action === 'clear' && !confirm('Delete every vote on this place? This can’t be undone.'))
        return 'Cancelled.';
      const reason = prompt('Reason (kept in the audit log)');
      if (!reason || reason.trim().length < 3) return 'Cancelled: give a short reason.';
      await adminFetch(`/api/v1/admin/places/${placeId}/ratings`, {
        method: 'POST',
        body: { action, reason },
      });
      setTimeout(() => window.location.reload(), 500);
      return 'Done.';
    });
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        style={ui.buttonSecondary}
        disabled={busy}
        onClick={() => act(locked ? 'unlock' : 'lock')}
      >
        {locked ? 'Unlock voting' : 'Lock voting'}
      </button>
      <button style={ui.buttonDanger} disabled={busy} onClick={() => act('clear')}>
        Clear votes
      </button>
      {error ? <span style={ui.error}>{error}</span> : null}
      {done ? <span role="status">{done}</span> : null}
    </span>
  );
}

/** D218: switch an area chat room on or off, or give it a name of your own. */
export function ChatRoomControls({
  roomId,
  enabled,
  name,
}: {
  roomId: string;
  enabled: boolean;
  name: string;
}) {
  const { busy, error, done, run } = useSubmit();
  const send = (body: object) =>
    run(async () => {
      const reason = prompt('Reason (kept in the audit log)');
      if (!reason || reason.trim().length < 3) return 'Cancelled: give a short reason.';
      await adminFetch(`/api/v1/admin/chat/rooms/${roomId}`, {
        method: 'POST',
        body: { ...body, reason },
      });
      setTimeout(() => window.location.reload(), 500);
      return 'Done.';
    });
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        style={enabled ? ui.buttonDanger : ui.buttonSecondary}
        disabled={busy}
        onClick={() => send({ action: enabled ? 'disable' : 'enable' })}
      >
        {enabled ? 'Switch off' : 'Switch on'}
      </button>
      <button
        style={ui.buttonSecondary}
        disabled={busy}
        onClick={() => {
          const next = window.prompt('Room name (empty uses the neighbourhood name)', name);
          if (next === null) return;
          void send({ action: 'rename', displayName: next });
        }}
      >
        Rename
      </button>
      {error ? <span style={ui.error}>{error}</span> : null}
      {done ? <span role="status">{done}</span> : null}
    </span>
  );
}

/** D218: lift someone's area-chat mute early. */
export function ChatUnmuteButton({ userId }: { userId: string }) {
  const { busy, error, run } = useSubmit();
  return (
    <span>
      <button
        style={ui.buttonSecondary}
        disabled={busy}
        onClick={() =>
          run(async () => {
            const reason = prompt('Reason for lifting the mute (kept in the audit log)');
            if (!reason || reason.trim().length < 3) return 'Cancelled.';
            await adminFetch(`/api/v1/admin/chat/users/${userId}/unmute`, {
              method: 'POST',
              body: { reason },
            });
            setTimeout(() => window.location.reload(), 500);
            return 'Done.';
          })
        }
      >
        Lift mute
      </button>
      {error ? <span style={ui.error}>{error}</span> : null}
    </span>
  );
}

/** D146: take any place down now (asks for a reason; Removals → Keep undoes it). */
export function RemovePlaceButton({ placeId, name }: { placeId: string; name: string }) {
  const { busy, error, done, run } = useSubmit();
  const remove = () =>
    run(async () => {
      const reason = prompt(`Remove “${name}”? Give a reason (kept in the audit log).`);
      if (!reason || reason.trim().length < 3) return 'Cancelled.';
      await adminFetch(`/api/v1/admin/places/${placeId}/remove`, {
        method: 'POST',
        body: { reason },
      });
      setTimeout(() => window.location.reload(), 500);
      return 'Removed.';
    });
  return (
    <span>
      <button style={ui.buttonDanger} disabled={busy} onClick={remove}>
        Remove
      </button>
      {error ? <span style={ui.error}> {error}</span> : null}
      {done ? <span role="status"> {done}</span> : null}
    </span>
  );
}

/**
 * D146: add a place now. The pin is typed as "latitude, longitude" (in Google Maps, long-
 * press the spot and copy the numbers shown); it must be inside Duval.
 */
export function AddPlaceForm() {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>(SUBMIT_CATEGORIES[0]);
  const [address, setAddress] = useState('');
  const [pin, setPin] = useState('');
  const { busy, error, done, run } = useSubmit();
  const submit = () =>
    run(async () => {
      const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(pin);
      if (!m) throw new Error('Enter the pin as "latitude, longitude", e.g. 30.3274, -81.6588');
      await adminFetch('/api/v1/admin/places', {
        method: 'POST',
        body: {
          name,
          category,
          ...(address.trim() ? { address } : {}),
          latitude: Number(m[1]),
          longitude: Number(m[2]),
        },
      });
      setName('');
      setAddress('');
      setPin('');
      return 'Added. It’s in the app now.';
    });
  return (
    <div style={{ ...ui.card, marginTop: 24, maxWidth: 560 }}>
      <h2 style={{ marginTop: 0 }}>Add a place</h2>
      <label style={ui.label}>
        Name
        <input
          style={ui.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
        />
      </label>
      <label style={ui.label}>
        Category
        <select style={ui.input} value={category} onChange={(e) => setCategory(e.target.value)}>
          {SUBMIT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <label style={ui.label}>
        Address (optional)
        <input
          style={ui.input}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={200}
        />
      </label>
      <label style={ui.label}>
        Pin: latitude, longitude (in Google Maps, long-press the spot and copy the numbers)
        <input
          style={ui.input}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="30.3274, -81.6588"
        />
      </label>
      <button style={ui.button} disabled={busy || !name.trim() || !pin.trim()} onClick={submit}>
        Add place
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

export function VoidStrike({
  userId,
  strikeId,
  url = `/api/v1/admin/users/${userId}/actions`,
}: {
  userId: string;
  strikeId: string;
  /** D191: a business login's strikes route instead of a person's actions. */
  url?: string;
}) {
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
            await adminFetch(url, {
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

/** D94: keep (restore) a place, or take it down now. */
export function RemovalActions({ id, status }: { id: string; status: string }) {
  const { busy, error, done, run } = useSubmit();
  const act = (action: 'keep' | 'remove') =>
    run(async () => {
      await adminFetch(`/api/v1/admin/removals/${id}`, { method: 'POST', body: { action } });
      setTimeout(() => window.location.reload(), 500);
      return action === 'keep' ? 'Kept: the place is listed.' : 'Removed from Places.';
    });
  return (
    <div>
      {status !== 'KEPT' ? (
        <button style={ui.button} disabled={busy} onClick={() => act('keep')}>
          {status === 'REMOVED' ? 'Restore place' : 'Keep place'}
        </button>
      ) : null}{' '}
      {status !== 'REMOVED' ? (
        <button style={ui.buttonSecondary} disabled={busy} onClick={() => act('remove')}>
          Remove now
        </button>
      ) : null}
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
 * D185 / D224 (B6.4): a request from the owner website. Approve (adds a new place to the
 * map, gives the business Owner access), approve onto a nearby existing place instead, or
 * turn it down with a reason the business reads.
 */
export function PlaceRequestActions({
  id,
  nearby,
}: {
  id: string;
  nearby: { id: string; name: string; meters: number }[];
}) {
  const [note, setNote] = useState('');
  const [usePlaceId, setUsePlaceId] = useState('');
  const { busy, error, done, run } = useSubmit();
  const decide = (decision: 'approve' | 'reject') =>
    run(async () => {
      await adminFetch(`/api/v1/admin/place-requests/${id}`, {
        method: 'POST',
        body:
          decision === 'approve'
            ? { decision, ...(usePlaceId ? { usePlaceId } : {}) }
            : { decision, note: note.trim() },
      });
      setTimeout(() => window.location.reload(), 600);
      return decision === 'approve' ? 'Approved.' : 'Sent back.';
    });
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
      {nearby.length ? (
        <label style={ui.label}>
          Already on the map? Approve onto it instead
          <select
            style={ui.input}
            value={usePlaceId}
            onChange={(e) => setUsePlaceId(e.target.value)}
          >
            <option value="">No, add it as a new place</option>
            {nearby.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.meters} m away)
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label style={ui.label}>
        Reason, if you turn it down (the business reads it)
        <input
          style={ui.input}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
        />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={ui.button} disabled={busy} onClick={() => decide('approve')}>
          Approve
        </button>
        <button
          style={ui.buttonSecondary}
          disabled={busy || note.trim().length < 3}
          onClick={() => decide('reject')}
        >
          Turn down
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
