'use client';

import { useState } from 'react';
import { adminFetch, ui } from './admin-ui';

/** D246: the emergency switch. Both directions ask for a reason (kept in the audit log). */
export function MaintenanceSwitch({ on }: { on: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState('');

  async function flip() {
    setError(undefined);
    const warning = on
      ? 'Switch maintenance OFF? People can sign in to the app again.'
      : 'Switch maintenance ON? Everyone is signed out of the app now and nobody can sign in until you switch it off.';
    if (!window.confirm(warning)) return;
    const reason = window.prompt('Reason (kept in the audit log):');
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    try {
      await adminFetch('/api/v1/admin/maintenance', {
        method: 'POST',
        body: {
          enabled: !on,
          reason,
          ...(!on && message.trim() ? { message: message.trim() } : {}),
        },
      });
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
      {on ? null : (
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={ui.label}>Extra line for people (optional, up to 200 characters)</span>
          <input
            style={ui.input}
            value={message}
            maxLength={200}
            placeholder="We expect to be back by 3 PM."
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
      )}
      <div>
        <button
          style={on ? ui.button : ui.buttonDanger}
          disabled={busy}
          onClick={() => void flip()}
        >
          {on ? 'Switch maintenance OFF' : 'Switch maintenance ON'}
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
