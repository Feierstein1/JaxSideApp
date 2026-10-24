'use client';

import { useState } from 'react';
import {
  COLORS,
  POLL_KINDS,
  POLL_LIMITS,
  POLL_TOPICS,
  type PollKind,
  type PollTopic,
} from '@jax/shared';
import { adminFetch, ui } from './admin-ui';

/**
 * D123 / D124: write or edit a poll (type, topic, question, answers, dates), and end or
 * delete one (admin portal, CSRF via adminFetch).
 */

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
  kind: PollKind;
  topic: PollTopic;
  question: string;
  details: string | null;
  choices: string[];
  maxPicks: number | null;
  scale: { low: string; high: string } | null;
  opensAt: string;
  closesAt: string;
}

const select = { ...ui.input, background: COLORS.background };

export function PollForm({ poll }: { poll?: PollFormValues }) {
  const week = nextWeek();
  const [kind, setKind] = useState<PollKind>(poll?.kind ?? 'single');
  const [topic, setTopic] = useState<PollTopic>(poll?.topic ?? 'community');
  const [question, setQuestion] = useState(poll?.question ?? '');
  const [details, setDetails] = useState(poll?.details ?? '');
  const [choices, setChoices] = useState<string[]>(
    poll && (poll.kind === 'single' || poll.kind === 'multi') ? poll.choices : ['', ''],
  );
  const [maxPicks, setMaxPicks] = useState(poll?.maxPicks ? String(poll.maxPicks) : '');
  const [unsure, setUnsure] = useState(poll?.kind === 'yes_no' && poll.choices.length > 2);
  const [low, setLow] = useState(poll?.scale?.low ?? 'Very poor');
  const [high, setHigh] = useState(poll?.scale?.high ?? 'Excellent');
  const [opens, setOpens] = useState(poll ? localInput(new Date(poll.opensAt)) : week.opens);
  const [closes, setCloses] = useState(poll ? localInput(new Date(poll.closesAt)) : week.closes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const limits = kind === 'multi' ? POLL_LIMITS.multi : POLL_LIMITS.single;
  const hasAnswers = kind === 'single' || kind === 'multi';

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const body = {
        kind,
        topic,
        question: question.trim(),
        ...(details.trim() ? { details: details.trim() } : {}),
        opensAt: new Date(opens).toISOString(),
        closesAt: new Date(closes).toISOString(),
        ...(kind === 'yes_no' ? { includeUnsure: unsure } : {}),
        ...(hasAnswers ? { choices: choices.map((c) => c.trim()).filter(Boolean) } : {}),
        ...(kind === 'multi' && maxPicks ? { maxPicks: Number(maxPicks) } : {}),
        ...(kind === 'scale' ? { lowLabel: low.trim(), highLabel: high.trim() } : {}),
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
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={ui.label} htmlFor="poll-kind">
            Type
          </label>
          <select
            id="poll-kind"
            style={select}
            value={kind}
            onChange={(e) => setKind(e.target.value as PollKind)}
          >
            {(Object.keys(POLL_KINDS) as PollKind[]).map((k) => (
              <option key={k} value={k}>
                {POLL_KINDS[k].label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={ui.label} htmlFor="poll-topic">
            Topic
          </label>
          <select
            id="poll-topic"
            style={select}
            value={topic}
            onChange={(e) => setTopic(e.target.value as PollTopic)}
          >
            {(Object.keys(POLL_TOPICS) as PollTopic[]).map((t) => (
              <option key={t} value={t}>
                {POLL_TOPICS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p style={{ ...ui.muted, fontSize: 14, marginTop: -6 }}>{POLL_KINDS[kind].hint}</p>

      <label style={ui.label} htmlFor="poll-question">
        Question
      </label>
      <input
        id="poll-question"
        style={ui.input}
        maxLength={200}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder={
          kind === 'yes_no'
            ? 'e.g. Should the city add more bike lanes downtown?'
            : kind === 'scale'
              ? 'e.g. How would you rate road conditions in your area?'
              : 'e.g. How do you usually get downtown?'
        }
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

      {kind === 'yes_no' ? (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 14px' }}>
          <input
            id="poll-unsure"
            type="checkbox"
            checked={unsure}
            onChange={(e) => setUnsure(e.target.checked)}
          />
          Also offer “Not sure”
        </label>
      ) : null}

      {hasAnswers ? (
        <>
          <span style={ui.label}>
            Answers ({limits.min}–{limits.max})
          </span>
          {choices.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                id={`poll-choice-${i}`}
                aria-label={`Answer ${i + 1}`}
                style={{ ...ui.input, margin: '6px 0' }}
                maxLength={80}
                value={c}
                onChange={(e) => setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))}
              />
              {choices.length > limits.min ? (
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
          {choices.length < limits.max ? (
            <button
              type="button"
              style={{ ...ui.buttonSecondary, margin: '6px 0 14px' }}
              onClick={() => setChoices([...choices, ''])}
            >
              Add an answer
            </button>
          ) : null}
        </>
      ) : null}

      {kind === 'multi' ? (
        <>
          <label style={ui.label} htmlFor="poll-max">
            People may pick up to (leave empty for “all that apply”)
          </label>
          <input
            id="poll-max"
            type="number"
            min={2}
            max={Math.max(2, choices.length - 1)}
            style={{ ...ui.input, maxWidth: 120 }}
            value={maxPicks}
            onChange={(e) => setMaxPicks(e.target.value)}
          />
        </>
      ) : null}

      {kind === 'scale' ? (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={ui.label} htmlFor="poll-low">
              1 means
            </label>
            <input
              id="poll-low"
              style={ui.input}
              maxLength={40}
              value={low}
              onChange={(e) => setLow(e.target.value)}
            />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={ui.label} htmlFor="poll-high">
              5 means
            </label>
            <input
              id="poll-high"
              style={ui.input}
              maxLength={40}
              value={high}
              onChange={(e) => setHigh(e.target.value)}
            />
          </div>
        </div>
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
        Before you publish: is the question neutral (no loaded words)? Do the answers cover the
        common views without overlapping? Could someone from any side answer it comfortably? After
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
