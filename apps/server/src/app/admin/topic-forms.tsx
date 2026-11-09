'use client';

import { useState } from 'react';
import {
  COLORS,
  TOPIC_CATEGORIES,
  TOPIC_DESCRIPTION_MAX,
  TOPIC_TITLE_MAX,
  type TopicCategory,
} from '@jax/shared';
import { adminFetch, ui } from './admin-ui';

/** D125: create or edit a citywide topic; decide suggestions; close or reopen topics. */

function localInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function useRun() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return { busy, error, run };
}

const ErrorText = ({ text }: { text?: string }) =>
  text ? (
    <p role="alert" style={ui.error}>
      {text}
    </p>
  ) : null;

function CategorySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: TopicCategory;
  onChange: (c: TopicCategory) => void;
}) {
  return (
    <select
      id={id}
      aria-label="Category"
      style={{ ...ui.input, background: COLORS.background }}
      value={value}
      onChange={(e) => onChange(e.target.value as TopicCategory)}
    >
      {(Object.keys(TOPIC_CATEGORIES) as TopicCategory[]).map((c) => (
        <option key={c} value={c}>
          {TOPIC_CATEGORIES[c]}
        </option>
      ))}
    </select>
  );
}

export interface TopicFormValues {
  id?: string;
  title: string;
  category: TopicCategory;
  description: string | null;
  pinned: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

export function TopicForm({ topic }: { topic?: TopicFormValues }) {
  const [title, setTitle] = useState(topic?.title ?? '');
  const [description, setDescription] = useState(topic?.description ?? '');
  const [pinned, setPinned] = useState(topic?.pinned ?? false);
  const [category, setCategory] = useState<TopicCategory>(topic?.category ?? 'other');
  const [opens, setOpens] = useState(localInput(topic?.opensAt ?? null));
  const [closes, setCloses] = useState(localInput(topic?.closesAt ?? null));
  const { busy, error, run } = useRun();

  const save = () =>
    run(async () => {
      const body = {
        title: title.trim(),
        category,
        ...(description.trim() ? { description: description.trim() } : {}),
        pinned,
        ...(opens ? { opensAt: new Date(opens).toISOString() } : {}),
        ...(closes ? { closesAt: new Date(closes).toISOString() } : {}),
      };
      if (topic?.id) {
        await adminFetch(`/api/v1/admin/topics/${topic.id}`, { method: 'PATCH', body });
      } else {
        await adminFetch('/api/v1/admin/topics', { method: 'POST', body });
      }
      window.location.href = '/admin/topics';
    });

  return (
    <div style={ui.card}>
      <label style={ui.label} htmlFor="topic-title">
        Title
      </label>
      <input
        id="topic-title"
        style={ui.input}
        maxLength={TOPIC_TITLE_MAX}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Game day: Jaguars vs Titans"
      />
      <label style={ui.label} htmlFor="topic-description">
        Description (optional)
      </label>
      <textarea
        id="topic-description"
        style={{ ...ui.input, minHeight: 60, fontFamily: 'inherit' }}
        maxLength={TOPIC_DESCRIPTION_MAX}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <label style={ui.label} htmlFor="topic-category">
        Category
      </label>
      <CategorySelect id="topic-category" value={category} onChange={setCategory} />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 14px' }}>
        <input
          id="topic-pinned"
          type="checkbox"
          checked={pinned}
          onChange={(e) => setPinned(e.target.checked)}
        />
        Pin to the top
      </label>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <label style={ui.label} htmlFor="topic-opens">
            Starts (empty = now)
          </label>
          <input
            id="topic-opens"
            type="datetime-local"
            style={ui.input}
            value={opens}
            onChange={(e) => setOpens(e.target.value)}
          />
        </div>
        <div>
          <label style={ui.label} htmlFor="topic-closes">
            Ends (optional)
          </label>
          <input
            id="topic-closes"
            type="datetime-local"
            style={ui.input}
            value={closes}
            onChange={(e) => setCloses(e.target.value)}
          />
        </div>
      </div>
      <button style={ui.button} disabled={busy} onClick={() => void save()}>
        {topic?.id ? 'Save changes' : 'Create topic'}
      </button>
      <ErrorText text={error} />
    </div>
  );
}

/** A suggestion: approve (optionally with a better title) or reject with a reason. */
export function SuggestionActions({
  id,
  title,
  category: suggested,
}: {
  id: string;
  title: string;
  category: TopicCategory;
}) {
  const [newTitle, setNewTitle] = useState(title);
  const [category, setCategory] = useState<TopicCategory>(suggested);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const decide = (body: Record<string, unknown>) =>
    run(async () => {
      await adminFetch(`/api/v1/admin/topics/${id}/decide`, { method: 'POST', body });
      window.location.reload();
    });
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          id={`suggestion-title-${id}`}
          aria-label="Title to publish"
          style={{ ...ui.input, margin: 0, flex: 1, minWidth: 220 }}
          maxLength={TOPIC_TITLE_MAX}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <div style={{ minWidth: 200 }}>
          <CategorySelect
            id={`suggestion-category-${id}`}
            value={category}
            onChange={setCategory}
          />
        </div>
        <button
          style={ui.button}
          disabled={busy}
          onClick={() =>
            void decide({
              action: 'approve',
              ...(newTitle.trim() !== title ? { title: newTitle.trim() } : {}),
              ...(category !== suggested ? { category } : {}),
            })
          }
        >
          Approve
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          id={`suggestion-reason-${id}`}
          aria-label="Reason (shown to the person who suggested it)"
          placeholder="Reason, shown to the person who suggested it"
          style={{ ...ui.input, margin: 0, flex: 1, minWidth: 220 }}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button
          style={ui.buttonSecondary}
          disabled={busy || reason.trim().length < 3}
          onClick={() => void decide({ action: 'reject', reason: reason.trim() })}
        >
          Reject
        </button>
      </div>
      <ErrorText text={error} />
    </div>
  );
}

/** Close an open topic or reopen a closed one. */
export function TopicStatusButton({ id, open }: { id: string; open: boolean }) {
  const { busy, error, run } = useRun();
  const act = () =>
    run(async () => {
      if (open && !confirm('Close this topic? It stays readable but takes no new posts.')) {
        throw new Error('Cancelled.');
      }
      await adminFetch(`/api/v1/admin/topics/${id}/decide`, {
        method: 'POST',
        body: { action: open ? 'close' : 'reopen' },
      });
      window.location.reload();
    });
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <a href={`/admin/topics?edit=${id}`} style={{ color: COLORS.primary, fontWeight: 600 }}>
        Edit
      </a>
      <button style={ui.buttonSecondary} disabled={busy} onClick={() => void act()}>
        {open ? 'Close' : 'Reopen'}
      </button>
      {error && error !== 'Cancelled.' ? <span style={ui.error}>{error}</span> : null}
    </span>
  );
}

/** D222: the switch for "topics people start need admin approval". */
export function TopicApprovalSwitch({ required }: { required: boolean }) {
  const { busy, error, run } = useRun();
  return (
    <span>
      <button
        style={required ? ui.buttonSecondary : ui.button}
        disabled={busy}
        onClick={() =>
          run(async () => {
            const reason = prompt(
              required
                ? 'Remove admin approval? New topics will appear at once. Reason (kept in the audit log):'
                : 'Make topics admin approved? New topics will wait for you. Reason (kept in the audit log):',
            );
            if (!reason || reason.trim().length < 3) return;
            await adminFetch('/api/v1/admin/topics/approval', {
              method: 'POST',
              body: { required: !required, reason },
            });
            window.location.reload();
          })
        }
      >
        {required ? 'Remove admin approval' : 'Make topics admin approved'}
      </button>
      <ErrorText text={error} />
    </span>
  );
}
