'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { COLORS } from '@jax/shared';
import { adminFetch, ui } from './admin-ui';

/** D188: giveaway forms: create, draw or pick, and what to do with each winner. */

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

function Status({ error, done }: { error?: string; done?: string }) {
  return (
    <>
      {error ? (
        <p role="alert" style={ui.error}>
          {error}
        </p>
      ) : null}
      {done ? <p role="status">{done}</p> : null}
    </>
  );
}

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '0 18px',
};
const hint: CSSProperties = { ...ui.muted, fontSize: 12, fontWeight: 400, display: 'block' };

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label style={{ ...ui.label, display: 'block' }}>
      {label}
      {help ? <span style={hint}>{help}</span> : null}
      {children}
    </label>
  );
}

/** "YYYY-MM-DDTHH:mm" in this computer's time, for datetime-local inputs. */
function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function GiveawayForm() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [f, setF] = useState({
    title: '',
    prize: '',
    notes: '',
    startsAt: localInput(today),
    endsAt: localInput(new Date(today.getTime() + 30 * 86_400_000)),
    pickMethod: 'RANDOM',
    winnerCount: '1',
    respondDays: '5',
    minPosts: '',
    minPostDays: '',
    minComments: '',
    minApprovedPlaces: '',
    requireConfirmedEmail: true,
    requireNoStrikes: true,
    joinedAfter: '',
    joinedBefore: '',
    minAccountAgeDays: '',
    minActiveDays: '',
    ticketsPerActiveDay: true,
    excludePastWinners: false,
  });
  const set =
    (k: keyof typeof f) =>
    (e: { target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement }) =>
      setF({
        ...f,
        [k]:
          e.target instanceof HTMLInputElement && e.target.type === 'checkbox'
            ? e.target.checked
            : e.target.value,
      });
  const { busy, error, done, run } = useSubmit();
  const num = (v: string) => (v.trim() ? Number(v) : undefined);
  const iso = (v: string) => (v ? new Date(v).toISOString() : undefined);

  const submit = () =>
    run(async () => {
      const r = await adminFetch<{ id: string }>('/api/v1/admin/giveaways', {
        method: 'POST',
        body: {
          title: f.title,
          prize: f.prize,
          notes: f.notes || undefined,
          startsAt: iso(f.startsAt),
          endsAt: iso(f.endsAt),
          pickMethod: f.pickMethod,
          winnerCount: Number(f.winnerCount),
          respondDays: Number(f.respondDays),
          minPosts: num(f.minPosts),
          minPostDays: num(f.minPostDays),
          minComments: num(f.minComments),
          minApprovedPlaces: num(f.minApprovedPlaces),
          requireConfirmedEmail: f.requireConfirmedEmail,
          requireNoStrikes: f.requireNoStrikes,
          joinedAfter: iso(f.joinedAfter),
          joinedBefore: iso(f.joinedBefore),
          minAccountAgeDays: num(f.minAccountAgeDays),
          minActiveDays: num(f.minActiveDays),
          ticketsPerActiveDay: f.pickMethod === 'RANDOM' && f.ticketsPerActiveDay,
          excludePastWinners: f.excludePastWinners,
        },
      });
      window.location.href = `/admin/giveaways/${r.id}`;
      return 'Created.';
    });

  const input = (k: keyof typeof f, props: Record<string, unknown> = {}) => (
    <input style={ui.input} value={f[k] as string} onChange={set(k)} {...props} />
  );
  const check = (k: keyof typeof f, text: string) => (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0 10px' }}>
      <input type="checkbox" checked={f[k] as boolean} onChange={set(k)} />
      {text}
    </label>
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={ui.card}>
        <h2 style={{ marginTop: 0 }}>The giveaway</h2>
        <div style={grid}>
          <Field label="Title" help="Shown to the winner.">
            {input('title', { maxLength: 100, placeholder: 'November giveaway' })}
          </Field>
          <Field label="Prize" help="Shown to the winner.">
            {input('prize', { maxLength: 200, placeholder: '$25 Amazon gift card' })}
          </Field>
          <Field label="Entry period starts">{input('startsAt', { type: 'datetime-local' })}</Field>
          <Field label="Entry period ends" help="Winners can be picked after this.">
            {input('endsAt', { type: 'datetime-local' })}
          </Field>
          <Field label="How winners are picked">
            <select style={ui.input} value={f.pickMethod} onChange={set('pickMethod')}>
              <option value="RANDOM">Random draw</option>
              <option value="MANUAL">I pick by hand</option>
            </select>
          </Field>
          <Field label="Number of winners">
            {input('winnerCount', { type: 'number', min: 1, max: 100 })}
          </Field>
          <Field label="Days to accept" help="After this, the slot can be drawn again.">
            {input('respondDays', { type: 'number', min: 1, max: 30 })}
          </Field>
        </div>
        <Field label="Notes (admins only)">
          <textarea
            style={{ ...ui.input, minHeight: 60 }}
            value={f.notes}
            onChange={set('notes')}
            maxLength={2000}
          />
        </Field>
      </div>

      <div style={ui.card}>
        <h2 style={{ marginTop: 0 }}>Who can win</h2>
        <p style={ui.muted}>
          Always: an active account (not banned or suspended), never an admin, created before the
          entry period ends. Leave a box empty to not use it. Activity counts only what was made in
          the entry period and is still visible.
        </p>
        <div style={grid}>
          <Field label="At least this many posts" help="Area posts and place-room posts.">
            {input('minPosts', { type: 'number', min: 1 })}
          </Field>
          <Field label="…on at least this many days" help="Different days, Jacksonville time.">
            {input('minPostDays', { type: 'number', min: 1 })}
          </Field>
          <Field label="At least this many comments">
            {input('minComments', { type: 'number', min: 1 })}
          </Field>
          <Field label="At least this many place suggestions" help="Approved ones only.">
            {input('minApprovedPlaces', { type: 'number', min: 1 })}
          </Field>
          <Field label="Joined on or after">
            {input('joinedAfter', { type: 'datetime-local' })}
          </Field>
          <Field label="Joined before">{input('joinedBefore', { type: 'datetime-local' })}</Field>
          <Field label="Account at least this many days old" help="When the entry period ends.">
            {input('minAccountAgeDays', { type: 'number', min: 1 })}
          </Field>
          <Field label="Opened the app on at least this many days" help="In the entry period.">
            {input('minActiveDays', { type: 'number', min: 1 })}
          </Field>
        </div>
        {check('requireConfirmedEmail', 'Confirmed email (needed to receive the prize)')}
        {check('requireNoStrikes', 'No strikes that still count')}
        {check('excludePastWinners', 'Leave out anyone who has won a giveaway before')}
        {f.pickMethod === 'RANDOM'
          ? check(
              'ticketsPerActiveDay',
              'Daily tickets: one ticket in the draw for each day they opened the app in the entry period',
            )
          : null}
      </div>

      <div>
        <button style={ui.button} disabled={busy} onClick={submit}>
          Create giveaway
        </button>
        <Status error={error} done={done} />
      </div>
    </div>
  );
}

/** Draw, pick by hand, or cancel. */
export function GiveawayActions({
  id,
  pickMethod,
  canPick,
  openSlots,
  cancelled,
}: {
  id: string;
  pickMethod: 'RANDOM' | 'MANUAL';
  /** The entry period is over. */
  canPick: boolean;
  openSlots: number;
  cancelled: boolean;
}) {
  const [username, setUsername] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, done, run } = useSubmit();
  const post = (body: Record<string, unknown>, confirmText?: string) =>
    run(async () => {
      if (confirmText && !confirm(confirmText)) return 'Cancelled.';
      const r = await adminFetch<{
        result: { drawn: number; poolSize: number; poolTickets?: number } | null;
      }>(`/api/v1/admin/giveaways/${id}`, { method: 'POST', body });
      setTimeout(() => window.location.reload(), 700);
      return r.result
        ? `Picked ${r.result.drawn} from ${r.result.poolSize} eligible${r.result.poolTickets ? ` (${r.result.poolTickets} tickets)` : ''}. They've been notified in the app.`
        : 'Done.';
    });
  if (cancelled) return null;
  return (
    <div style={ui.card}>
      <h2 style={{ marginTop: 0 }}>Pick winners</h2>
      {!canPick ? (
        <p style={ui.muted}>Winners can be picked once the entry period ends.</p>
      ) : openSlots === 0 ? (
        <p style={ui.muted}>
          Every winner slot is taken. A slot opens if a winner declines, doesn’t answer in time, or
          is disqualified.
        </p>
      ) : pickMethod === 'RANDOM' ? (
        <>
          <p>
            {openSlots} open slot{openSlots === 1 ? '' : 's'}. The draw picks at random from the
            eligible accounts below and notifies the winners in the app.
          </p>
          <button
            style={ui.button}
            disabled={busy}
            onClick={() => post({ action: 'draw' }, `Draw ${openSlots} winner(s) now?`)}
          >
            Draw {openSlots} winner{openSlots === 1 ? '' : 's'}
          </button>
        </>
      ) : (
        <>
          <p>
            {openSlots} open slot{openSlots === 1 ? '' : 's'}. Pick an eligible account by username.
          </p>
          <div style={{ display: 'flex', gap: 10, maxWidth: 460 }}>
            <input
              style={{ ...ui.input, margin: 0 }}
              placeholder="@username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <button
              style={ui.button}
              disabled={busy || !username.trim()}
              onClick={() => post({ action: 'pick', username }, `Pick ${username} as a winner?`)}
            >
              Pick
            </button>
          </div>
        </>
      )}
      <details style={{ marginTop: 18 }}>
        <summary style={{ cursor: 'pointer', color: COLORS.textMuted }}>
          Cancel this giveaway
        </summary>
        <div style={{ marginTop: 10, maxWidth: 460 }}>
          <Field label="Reason (audit log)">
            <input style={ui.input} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <button
            style={ui.buttonDanger}
            disabled={busy}
            onClick={() =>
              post(
                { action: 'cancel', reason },
                'Cancel the giveaway? Winners who haven’t answered can’t accept any more.',
              )
            }
          >
            Cancel giveaway
          </button>
        </div>
      </details>
      <Status error={error} done={done} />
    </div>
  );
}

/** One winner's buttons: show email (after they accept), prize sent, disqualify. */
export function WinnerActions({
  giveawayId,
  winnerId,
  status,
}: {
  giveawayId: string;
  winnerId: string;
  status: string;
}) {
  const [email, setEmail] = useState<string>();
  const [mode, setMode] = useState<'reveal' | 'sent' | 'disqualify'>();
  const [text, setText] = useState('');
  const { busy, error, done, run } = useSubmit();
  const post = (body: Record<string, unknown>) =>
    adminFetch<{ result: { email: string } | null }>(
      `/api/v1/admin/giveaways/${giveawayId}/winners/${winnerId}`,
      { method: 'POST', body },
    );
  const go = () =>
    run(async () => {
      if (mode === 'reveal') {
        const r = await post({ action: 'revealEmail', reason: text });
        setEmail(r.result?.email);
        setMode(undefined);
        return 'Shown (recorded in the audit log).';
      }
      await post(
        mode === 'sent'
          ? { action: 'prizeSent', note: text || undefined }
          : { action: 'disqualify', reason: text },
      );
      setTimeout(() => window.location.reload(), 600);
      return 'Done.';
    });
  const accepted = status === 'ACCEPTED' || status === 'PRIZE_SENT';
  return (
    <div style={{ minWidth: 220 }}>
      {email ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <code style={{ background: COLORS.surfaceMuted, padding: '3px 8px', borderRadius: 6 }}>
            {email}
          </code>
          <button
            style={{ ...ui.buttonSecondary, padding: '4px 10px', fontSize: 12 }}
            onClick={() => navigator.clipboard?.writeText(email)}
          >
            Copy
          </button>
        </div>
      ) : null}
      {!mode ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {accepted && !email ? (
            <button
              style={{ ...ui.button, padding: '6px 12px', fontSize: 13 }}
              onClick={() => {
                setText('Send the giveaway prize');
                setMode('reveal');
              }}
            >
              Show email
            </button>
          ) : null}
          {status === 'ACCEPTED' ? (
            <button
              style={{ ...ui.buttonSecondary, padding: '6px 12px', fontSize: 13 }}
              onClick={() => {
                setText('');
                setMode('sent');
              }}
            >
              Prize sent
            </button>
          ) : null}
          {status === 'NOTIFIED' || status === 'ACCEPTED' ? (
            <button
              style={{
                ...ui.buttonSecondary,
                padding: '6px 12px',
                fontSize: 13,
                color: COLORS.error,
              }}
              onClick={() => {
                setText('');
                setMode('disqualify');
              }}
            >
              Disqualify
            </button>
          ) : null}
        </div>
      ) : (
        <div>
          <Field
            label={
              mode === 'reveal'
                ? 'Why (audit log)'
                : mode === 'sent'
                  ? 'Note (optional, e.g. order number)'
                  : 'Reason (admins only)'
            }
          >
            <input
              style={{ ...ui.input, margin: '4px 0 8px' }}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              style={{
                ...(mode === 'disqualify' ? ui.buttonDanger : ui.button),
                padding: '6px 12px',
                fontSize: 13,
              }}
              disabled={busy}
              onClick={go}
            >
              {mode === 'reveal' ? 'Show email' : mode === 'sent' ? 'Mark sent' : 'Disqualify'}
            </button>
            <button
              style={{ ...ui.buttonSecondary, padding: '6px 12px', fontSize: 13 }}
              onClick={() => setMode(undefined)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <Status error={error} done={done} />
    </div>
  );
}
