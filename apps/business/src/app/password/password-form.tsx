'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { TEXT } from '@/text';
import { post } from '../client';
import { ui } from '../ui';

export function PasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNext] = useState('');
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await post('/api/auth/password', { currentPassword, newPassword });
      setCurrent('');
      setNext('');
      if (forced) {
        router.replace('/');
        router.refresh();
      } else {
        setMessage(TEXT.password.done);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : TEXT.common.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label style={ui.label}>
        {TEXT.password.current}
        <input
          style={ui.input}
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </label>
      <label style={ui.label}>
        {TEXT.password.next}
        <input
          style={ui.input}
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={newPassword}
          onChange={(e) => setNext(e.target.value)}
          required
        />
      </label>
      <p style={ui.muted}>{TEXT.password.rule}</p>
      {error && (
        <p role="alert" style={ui.error}>
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <button type="submit" disabled={busy} style={ui.primary}>
        {busy ? TEXT.common.saving : TEXT.password.submit}
      </button>
    </form>
  );
}
