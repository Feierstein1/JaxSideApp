'use client';

import { useState } from 'react';
import { COLORS, SCREENING_ACTIONS, SCREENING_CATEGORIES } from '@jax/shared';
import { adminFetch, ui } from './admin-ui';

/** P15.9: the Screening page's controls (test a sentence, add a term, change a term). */

const ACTION_LABEL = {
  BLOCK: 'Block (refuse)',
  HOLD: 'Hold for review',
  WARN: 'Warn ("Post anyway?")',
} as const;
const OUTCOME = {
  allowed: 'Allowed: nothing matches.',
  warned: 'Warned: the person is asked "Post anyway?".',
  held: 'Held: saved hidden and sent to the Reports queue.',
  blocked: 'Blocked: refused with a message.',
} as const;

const select = { ...ui.input, background: COLORS.background, margin: 0 };

type TestResult = {
  outcome: keyof typeof OUTCOME;
  matches: { id: string; term: string; action: string; category: string; enabled: boolean }[];
};

export function ScreeningTest() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<TestResult>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function test() {
    setBusy(true);
    setError(undefined);
    try {
      setResult(
        await adminFetch<TestResult>('/api/v1/admin/screening/test', {
          method: 'POST',
          body: { text },
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={ui.card}>
      <label style={ui.label} htmlFor="screening-test">
        Test a sentence
      </label>
      <textarea
        id="screening-test"
        style={{ ...ui.input, minHeight: 70, fontFamily: 'inherit' }}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste text the way someone might write it, disguises included."
      />
      <button style={ui.button} disabled={busy || !text.trim()} onClick={() => void test()}>
        Check
      </button>
      {error ? <p style={ui.error}>{error}</p> : null}
      {result ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontWeight: 700, margin: '0 0 6px' }}>{OUTCOME[result.outcome]}</p>
          {result.matches.length ? (
            <ul style={{ margin: 0 }}>
              {result.matches.map((m) => (
                <li key={m.id}>
                  “{m.term}” · {ACTION_LABEL[m.action as keyof typeof ACTION_LABEL]} ·{' '}
                  {m.category.toLowerCase()}
                  {m.enabled ? '' : ' · turned off (not applied)'}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AddScreeningRule() {
  const [term, setTerm] = useState('');
  const [action, setAction] = useState<(typeof SCREENING_ACTIONS)[number]>('BLOCK');
  const [category, setCategory] = useState<(typeof SCREENING_CATEGORIES)[number]>('SLUR');
  const [match, setMatch] = useState<'WORD' | 'CONTAINS'>('WORD');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    setError(undefined);
    try {
      await adminFetch('/api/v1/admin/screening', {
        method: 'POST',
        body: {
          term: term.trim(),
          action,
          category,
          match,
          ...(message.trim() ? { message: message.trim() } : {}),
        },
      });
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div style={ui.card}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <label style={ui.label} htmlFor="rule-term">
            Word or phrase
          </label>
          <input
            id="rule-term"
            style={{ ...ui.input, margin: '6px 0 0' }}
            maxLength={100}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <div style={{ flex: 1, minWidth: 170 }}>
          <label style={ui.label} htmlFor="rule-action">
            Action
          </label>
          <select
            id="rule-action"
            style={select}
            value={action}
            onChange={(e) => setAction(e.target.value as typeof action)}
          >
            {SCREENING_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={ui.label} htmlFor="rule-category">
            Category
          </label>
          <select
            id="rule-category"
            style={select}
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
          >
            {SCREENING_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 170 }}>
          <label style={ui.label} htmlFor="rule-match">
            Match
          </label>
          <select
            id="rule-match"
            style={select}
            value={match}
            onChange={(e) => setMatch(e.target.value as typeof match)}
          >
            <option value="WORD">Whole word or phrase</option>
            <option value="CONTAINS">Anywhere (even inside words)</option>
          </select>
        </div>
      </div>
      <label style={{ ...ui.label, display: 'block', marginTop: 12 }} htmlFor="rule-message">
        Message shown to the person (optional)
      </label>
      <input
        id="rule-message"
        style={ui.input}
        maxLength={300}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button
        style={ui.button}
        disabled={busy || term.trim().length < 2}
        onClick={() => void add()}
      >
        Add term
      </button>
      {error ? <p style={ui.error}>{error}</p> : null}
    </div>
  );
}

/** One term: change its action, or turn it off / on. */
export function ScreeningRuleControls({
  id,
  action,
  enabled,
}: {
  id: string;
  action: (typeof SCREENING_ACTIONS)[number];
  enabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await adminFetch(`/api/v1/admin/screening/${id}`, { method: 'PATCH', body });
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <select
        aria-label="Action"
        style={{ ...select, width: 'auto', padding: '6px 8px', fontSize: 14 }}
        value={action}
        disabled={busy}
        onChange={(e) => void patch({ action: e.target.value })}
      >
        {SCREENING_ACTIONS.map((a) => (
          <option key={a} value={a}>
            {ACTION_LABEL[a]}
          </option>
        ))}
      </select>
      <button
        style={ui.buttonSecondary}
        disabled={busy}
        onClick={() => void patch({ enabled: !enabled })}
      >
        {enabled ? 'Turn off' : 'Turn on'}
      </button>
      {error ? <span style={ui.error}>{error}</span> : null}
    </span>
  );
}
