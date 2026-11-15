'use client';

import { useState, type CSSProperties } from 'react';
import { adminFetch, ui } from './admin-ui';

/** D248: promo code forms: make a code, and turn one off or on. */

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
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '0 18px',
};

export function PromoCodeForm() {
  const [code, setCode] = useState('');
  const [plan, setPlan] = useState('STANDARD');
  const [days, setDays] = useState(90); // Kenny's launch code: 3 months of Standard
  const [maxUses, setMaxUses] = useState(50);
  const [expires, setExpires] = useState('');
  const [note, setNote] = useState('');
  const { busy, error, done, run } = useSubmit();
  const submit = () =>
    run(async () => {
      await adminFetch('/api/v1/admin/promo-codes', {
        method: 'POST',
        body: {
          code,
          plan,
          days,
          maxUses,
          // The end of that day in Jacksonville (Eastern time).
          expiresAt: expires ? new Date(`${expires}T23:59:59-05:00`).toISOString() : null,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      window.location.reload();
    });
  return (
    <div style={{ ...ui.card, maxWidth: 760 }}>
      <h2 style={{ marginTop: 0 }}>New code</h2>
      <div style={grid}>
        <label style={ui.label}>
          Code
          <input
            style={ui.input}
            value={code}
            maxLength={24}
            placeholder="JAXLAUNCH"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <label style={ui.label}>
          Plan
          <select style={ui.input} value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="STANDARD">Standard</option>
            <option value="PREMIUM">Premium</option>
          </select>
        </label>
        <label style={ui.label}>
          Days
          <input
            style={ui.input}
            type="number"
            min={1}
            max={366}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </label>
        <label style={ui.label}>
          Uses in all
          <input
            style={ui.input}
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(Number(e.target.value))}
          />
        </label>
        <label style={ui.label}>
          Last day (optional)
          <input
            style={ui.input}
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
        </label>
        <label style={ui.label}>
          Note (optional)
          <input
            style={ui.input}
            value={note}
            maxLength={300}
            placeholder="Launch: first 50 businesses"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
      <button style={ui.button} disabled={busy || code.length < 4} onClick={() => void submit()}>
        Make code
      </button>
      <Status error={error} done={done} />
    </div>
  );
}

export function PromoActiveToggle({ id, active }: { id: string; active: boolean }) {
  const { busy, error, run } = useSubmit();
  return (
    <>
      <button
        style={active ? ui.buttonSecondary : ui.button}
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await adminFetch(`/api/v1/admin/promo-codes/${id}`, {
              method: 'PATCH',
              body: { active: !active },
            });
            window.location.reload();
          })
        }
      >
        {active ? 'Turn off' : 'Turn on'}
      </button>
      <Status error={error} />
    </>
  );
}
