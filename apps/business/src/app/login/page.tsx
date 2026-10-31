'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { COLORS } from '@jax/shared';
import { TEXT } from '@/text';

const input = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  marginTop: 6,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  fontSize: 16,
} as const;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error?.message ?? TEXT.login.failed);
        return;
      }
      setPassword('');
      router.replace('/');
      router.refresh();
    } catch {
      setError(TEXT.login.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 400, margin: '0 auto', padding: '64px 16px' }}>
      <form
        onSubmit={submit}
        style={{
          background: COLORS.background,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 12,
          padding: 24,
        }}
      >
        <h1 style={{ marginTop: 0 }}>{TEXT.login.title}</h1>
        <label>
          {TEXT.login.email}
          <input
            style={input}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label style={{ display: 'block', marginTop: 16 }}>
          {TEXT.login.password}
          <input
            style={input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p role="alert" style={{ color: COLORS.error }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          style={{
            marginTop: 20,
            width: '100%',
            padding: '12px 16px',
            border: 0,
            borderRadius: 8,
            background: COLORS.primary,
            color: COLORS.onPrimary,
            fontSize: 16,
            cursor: 'pointer',
          }}
        >
          {busy ? TEXT.login.busy : TEXT.login.submit}
        </button>
      </form>
    </main>
  );
}
