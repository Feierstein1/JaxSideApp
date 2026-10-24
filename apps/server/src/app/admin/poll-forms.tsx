'use client';

import { useState } from 'react';
import { COLORS, POLL_CHOICES_MAX, POLL_CHOICES_MIN } from '@jax/shared';
import { adminFetch, ui } from './admin-ui';

/** D123: write or edit a poll, and end or delete one (admin portal, CSRF via adminFetch). */

/** "2026-10-27T09:00" in this computer's time zone, for a datetime-local input. */
function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Next Monday 9 AM to the following Monday 9 AM: a week, as the default. */
function nextWeek() {
  const opens = new Date();
  opens.setDate(opens.getDate() + ((8 - opens.getDay()) % 7 || 7));
  opens.setHours(9, 0, 0, 0);
  const closes = new Date(opens);
  closes.setDate(closes.getDate() + 7);
  return { opens: localInput(opens), closes: localInput(closes) };
}

export interface PollFormValues {
  id?: string;
  question: string;
  details: string | null;
  choices: string[];
  opensAt: string;
  closesAt: string;
}

export function PollForm({ poll }: { poll?: PollFormValues }) {
  const week = nextWeek();
  const [question, setQuestion] = useState(poll?.question ?? '');
  const [details, setDetails] = useState(poll?.details ?? '');
  const [choices, setChoices] = useState<string[]>(poll?.choices ?? ['', '']);
  const [opens, setOpens] = useState(poll ? localInput(new Date(poll.opensAt)) : week.opens);
  const [closes, setCloses] = useState(poll ? localInput(new Date(poll.closesAt)) : week.closes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const body = {
        question: question.trim(),
        ...(details.trim() ? { details: details.trim() } : {}),
        choices: choices.map((c) => c.trim()).filter(Boolean),
        opensAt: new Date(opens).toISOString(),
        closesAt: new Date(closes).toISOString(),
      };
      if (poll?.id) {
        await adminFetch(`/api/v1/admin/polls/${poll.id}`, { method: 'PATCH', body });
      } else {
        await adminFetch('/api/v1/admin/polls', { method: 'POST', body });
      }
      window.location.href = '/admin/polls';
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={ui.card}>
      <label style={ui.label} htmlFor="poll-question">
        Question
      </label>
      <input
        id="poll-question"
        style={ui.input}
        maxLength={200}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="e.g. How do you usually get downtown?"
      />
      <label style={ui.label} htmlFor="poll-details">
        Details (optional)
      </label>
      <textarea
        id="poll-details"
        style={{ ...ui.input, minHeight: 60, fontFamily: 'inherit' }}
        maxLength={500}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="Neutral background only; no opinion."
      />
      <span style={ui.label}>
        Choices ({POLL_CHOICES_MIN}–{POLL_CHOICES_MAX})
      </span>
      {choices.map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            id={`poll-choice-${i}`}
            aria-label={`Choice ${i + 1}`}
            style={{ ...ui.input, margin: '6px 0' }}
            maxLength={80}
            value={c}
            onChange={(e) => setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))}
          />
          {choices.length > POLL_CHOICES_MIN ? (
            <button
              type="button"
              style={ui.buttonSecondary}
              onClick={() => setChoices(choices.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}
      {choices.length < POLL_CHOICES_MAX ? (
        <button
          type="button"
          style={{ ...ui.buttonSecondary, margin: '6px 0 14px' }}
          onClick={() => setChoices([...choices, ''])}
        >
          Add a choice
        </button>
      ) : null}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <label style={ui.label} htmlFor="poll-opens">
            Opens
          </label>
          <input
            id="poll-opens"
            type="datetime-local"
            style={ui.input}
            value={opens}
            onChange={(e) => setOpens(e.target.value)}
          />
        </div>
        <div>
          <label style={ui.label} htmlFor="poll-closes">
            Closes
          </label>
          <input
            id="poll-closes"
            type="datetime-local"
            style={ui.input}
            value={closes}
            onChange={(e) => setCloses(e.target.value)}
          />
        </div>
      </div>
      <p style={{ ...ui.muted, fontSize: 14 }}>
        Before you publish: is the question neutral (no loaded words)? Do the choices cover the
        common answers without overlapping? Could someone from any side answer it comfortably? After
        it opens, the wording can’t change.
      </p>
      <button style={ui.button} disabled={busy} onClick={() => void save()}>
        {poll?.id ? 'Save changes' : 'Schedule poll'}
      </button>
      {error ? (
        <p role="alert" style={ui.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PollActions({ id, status }: { id: string; status: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function act(kind: 'delete' | 'end') {
    const sure = confirm(
      kind === 'delete'
        ? 'Delete this poll? It hasn’t opened yet, so nobody has seen it.'
        : 'End this poll now? It closes and is counted right away; this can’t be undone.',
    );
    if (!sure) return;
    setBusy(true);
    setError(undefined);
    try {
      if (kind === 'delete') {
        await adminFetch(`/api/v1/admin/polls/${id}`, { method: 'DELETE' });
      } else {
        await adminFetch(`/api/v1/admin/polls/${id}/end`, { method: 'POST' });
      }
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {status === 'upcoming' ? (
        <>
          <a href={`/admin/polls?edit=${id}`} style={{ color: COLORS.primary, fontWeight: 600 }}>
            Edit
          </a>
          <button style={ui.buttonSecondary} disabled={busy} onClick={() => void act('delete')}>
            Delete
          </button>
        </>
      ) : null}
      {status === 'open' ? (
        <button style={ui.buttonSecondary} disabled={busy} onClick={() => void act('end')}>
          End now
        </button>
      ) : null}
      {error ? (
        <span role="alert" style={ui.error}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
