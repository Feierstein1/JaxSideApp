'use client';

import { useState } from 'react';
import { COLORS, SUBMIT_CATEGORIES } from '@jax/shared';
import { adminFetch, ui } from './admin-ui';

/** P5.12: the place-suggestion queue (client side: selection, decisions, bulk). */

export interface QueueItem {
  id: string;
  name: string;
  category: string;
  address: string | null;
  notes: string | null;
  latitude: number;
  longitude: number;
  status: string;
  decisionReason: string | null;
  createdAt: string;
  submitter: { id: string; username: string; status: string };
  duplicates: {
    places: { id: string; name: string; category: string; distanceMeters: number }[];
    pending: { id: string; name: string; category: string; distanceMeters: number }[];
  };
  /** D94: community votes ("It's here" = support). */
  votes: {
    voter: { id: string; username: string };
    support: boolean;
    distanceMeters: number;
    createdAt: string;
  }[];
}

const label = (c: string) => c.replaceAll('_', ' ');

function mapUrl(lat: number, lon: number) {
  const d = 0.0025;
  const bbox = [lon - d, lat - d * 0.8, lon + d, lat + d * 0.8].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
}

export function SubmissionQueue({
  items,
  history,
  pending,
}: {
  items: QueueItem[];
  history: Record<string, Record<string, number>>;
  pending: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setError(undefined);
    try {
      setMessage(await fn());
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function bulk(decision: 'approve' | 'reject') {
    const chosen = items.filter((i) => selected.has(i.id));
    const list = chosen.map((i) => `• ${i.name} (${label(i.category)})`).join('\n');
    let reason: string | null = null;
    if (decision === 'reject') {
      reason = prompt(`Reason for rejecting these ${chosen.length}? (the submitters see it)`);
      if (!reason) return;
    }
    if (
      !confirm(
        `${decision === 'approve' ? 'Approve' : 'Reject'} these ${chosen.length}?\n\n${list}`,
      )
    )
      return;
    void run(async () => {
      const r = await adminFetch<{ results: { ok: boolean }[] }>('/api/v1/admin/submissions/bulk', {
        method: 'POST',
        body: { decision, ids: chosen.map((i) => i.id), ...(reason ? { reason } : {}) },
      });
      const ok = r.results.filter((x) => x.ok).length;
      return `${ok} of ${chosen.length} done${ok < chosen.length ? ' (others were already decided)' : ''}.`;
    });
  }

  return (
    <div>
      {pending && items.length ? (
        <div
          style={{
            ...ui.card,
            position: 'sticky',
            top: 0,
            zIndex: 1,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            marginBottom: 12,
            padding: 12,
          }}
        >
          <label>
            <input
              type="checkbox"
              checked={selected.size === items.length}
              onChange={(e) =>
                setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())
              }
            />{' '}
            Select all ({items.length})
          </label>
          <span style={{ flex: 1 }} />
          <button
            style={ui.button}
            disabled={busy || !selected.size}
            onClick={() => bulk('approve')}
          >
            Approve selected ({selected.size})
          </button>
          <button
            style={ui.buttonSecondary}
            disabled={busy || !selected.size}
            onClick={() => bulk('reject')}
          >
            Reject selected
          </button>
        </div>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {error ? (
        <p role="alert" style={ui.error}>
          {error}
        </p>
      ) : null}
      {items.length === 0 ? <p style={ui.muted}>Nothing here.</p> : null}
      <div style={{ display: 'grid', gap: 12 }}>
        {items.map((s) => (
          <Item
            key={s.id}
            s={s}
            history={history[s.submitter.id] ?? {}}
            pending={pending}
            checked={selected.has(s.id)}
            onToggle={() => toggle(s.id)}
            run={run}
            busy={busy}
          />
        ))}
      </div>
    </div>
  );
}

function Item({
  s,
  history,
  pending,
  checked,
  onToggle,
  run,
  busy,
}: {
  s: QueueItem;
  history: Record<string, number>;
  pending: boolean;
  checked: boolean;
  onToggle: () => void;
  run: (fn: () => Promise<string>) => Promise<void>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(s.name);
  const [category, setCategory] = useState(s.category);
  const [address, setAddress] = useState(s.address ?? '');
  const decide = (body: Record<string, unknown>, done: string) =>
    run(async () => {
      await adminFetch(`/api/v1/admin/submissions/${s.id}`, { method: 'POST', body });
      return done;
    });
  const dupes = [...s.duplicates.places, ...s.duplicates.pending];

  return (
    <div
      style={{
        ...ui.card,
        display: 'grid',
        gridTemplateColumns: 'auto 1fr 280px',
        gap: 16,
        borderLeft: `6px solid ${dupes.length ? COLORS.accent : COLORS.primary}`,
      }}
    >
      <div>
        {pending ? (
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            aria-label={`Select ${s.name}`}
          />
        ) : null}
      </div>
      <div>
        <h3 style={{ margin: '0 0 4px' }}>{s.name}</h3>
        <div style={ui.muted}>
          {label(s.category)}
          {s.address ? ` · ${s.address}` : ''} · by{' '}
          <a href={`/admin/users/${s.submitter.id}`}>@{s.submitter.username}</a> (
          {Object.entries(history)
            .map(([k, v]) => `${v} ${k.toLowerCase()}`)
            .join(', ') || 'first suggestion'}
          ) · {new Date(s.createdAt).toLocaleDateString()}
        </div>
        {s.notes ? <p style={{ whiteSpace: 'pre-wrap' }}>“{s.notes}”</p> : null}
        {s.decisionReason ? <p style={ui.muted}>Reason: {s.decisionReason}</p> : null}
        {/* D94: 10 votes one way decide it; every vote is listed. */}
        <details style={{ margin: '6px 0' }}>
          <summary>
            Community: {s.votes.filter((v) => v.support).length} here ·{' '}
            {s.votes.filter((v) => !v.support).length} not here
          </summary>
          <ul>
            {s.votes.map((v) => (
              <li key={v.voter.id}>
                <a href={`/admin/users/${v.voter.id}`}>@{v.voter.username}</a>:{' '}
                {v.support ? 'It’s here' : 'Not here'} · {v.distanceMeters} m away ·{' '}
                {new Date(v.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </details>
        {dupes.length ? (
          <div
            style={{ background: COLORS.accentSoft, padding: 10, borderRadius: 8, margin: '8px 0' }}
          >
            <strong>Possible duplicates</strong>
            {s.duplicates.places.map((p) => (
              <div
                key={p.id}
                style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}
              >
                <span style={{ flex: 1 }}>
                  {p.name} · {label(p.category)} · {p.distanceMeters} m
                </span>
                {pending ? (
                  <button
                    style={{ ...ui.buttonSecondary, padding: '2px 8px', fontSize: 12 }}
                    disabled={busy}
                    onClick={() =>
                      decide({ decision: 'merge', placeId: p.id }, `Merged into ${p.name}.`)
                    }
                  >
                    Merge into this
                  </button>
                ) : null}
              </div>
            ))}
            {s.duplicates.pending.map((p) => (
              <div key={p.id} style={{ marginTop: 4 }}>
                Another suggestion: {p.name} · {p.distanceMeters} m
              </div>
            ))}
          </div>
        ) : null}
        {pending && editing ? (
          <div style={{ display: 'grid', gap: 6, maxWidth: 420 }}>
            <input
              style={{ ...ui.input, margin: 0 }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Name"
            />
            <select
              style={{ ...ui.input, margin: 0 }}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Category"
            >
              {SUBMIT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </select>
            <input
              style={{ ...ui.input, margin: 0 }}
              value={address}
              placeholder="Address"
              onChange={(e) => setAddress(e.target.value)}
              aria-label="Address"
            />
          </div>
        ) : null}
        {pending ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              style={ui.button}
              disabled={busy}
              onClick={() =>
                decide(
                  {
                    decision: 'approve',
                    ...(editing && name !== s.name ? { name } : {}),
                    ...(editing && category !== s.category ? { category } : {}),
                    ...(editing && address && address !== s.address ? { address } : {}),
                  },
                  `Approved ${name}.`,
                )
              }
            >
              Approve{editing ? ' with changes' : ''}
            </button>
            <button
              style={ui.buttonSecondary}
              disabled={busy}
              onClick={() => setEditing((e) => !e)}
            >
              {editing ? 'Cancel edits' : 'Edit before approving'}
            </button>
            <button
              style={{ ...ui.buttonSecondary, color: COLORS.error, borderColor: COLORS.error }}
              disabled={busy}
              onClick={() => {
                const reason = prompt('Reason (the submitter sees it):');
                if (reason) void decide({ decision: 'reject', reason }, 'Rejected.');
              }}
            >
              Reject
            </button>
          </div>
        ) : null}
      </div>
      <iframe
        title={`Map of ${s.name}`}
        src={mapUrl(s.latitude, s.longitude)}
        style={{
          width: 280,
          height: 180,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 8,
        }}
        loading="lazy"
      />
    </div>
  );
}
