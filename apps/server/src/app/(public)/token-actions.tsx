'use client';

import { useState, type FormEvent } from 'react';
import { PASSWORD_MAX, PASSWORD_MIN } from '@jax/shared';

type State = { kind: 'idle' | 'busy' | 'done' | 'error'; message?: string };

async function postJson(path: string, body: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      message: res.ok ? (json.message ?? '') : (json.error?.message ?? 'Something went wrong'),
    };
  } catch {
    return { ok: false, message: 'Could not reach the server' };
  }
}

const box = { maxWidth: 420, margin: '64px auto', fontFamily: 'system-ui', padding: 16 } as const;
const input = { display: 'block', width: '100%', padding: 8, margin: '8px 0 16px' } as const;

export function VerifyEmail({ token }: { token: string | null }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  if (!token) return <main style={box}>This link is missing its token.</main>;

  async function confirm() {
    setState({ kind: 'busy' });
    const r = await postJson('/api/v1/auth/verify-email', { token });
    setState(r.ok ? { kind: 'done' } : { kind: 'error', message: r.message });
  }

  return (
    <main style={box}>
      <h1>Confirm your email</h1>
      {state.kind === 'done' ? (
        <p role="status">Your email is confirmed. You can go back to the app.</p>
      ) : (
        <>
          <button onClick={confirm} disabled={state.kind === 'busy'}>
            Confirm my email
          </button>
          {state.kind === 'error' && <p role="alert">{state.message}</p>}
        </>
      )}
    </main>
  );
}

// Forms use method="post": if scripts fail to load, nothing typed ends up in the URL.
export function ResetPassword({ token }: { token: string | null }) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function requestLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email') ?? '');
    setState({ kind: 'busy' });
    const r = await postJson('/api/v1/auth/password-reset/request', { email });
    setState({ kind: r.ok ? 'done' : 'error', message: r.message });
  }

  async function setPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get('password') ?? '');
    if (newPassword !== String(form.get('confirm') ?? '')) {
      setState({ kind: 'error', message: "The passwords don't match" });
      return;
    }
    setState({ kind: 'busy' });
    const r = await postJson('/api/v1/auth/password-reset/confirm', { token, newPassword });
    setState(
      r.ok
        ? { kind: 'done', message: 'Password changed. Sign in again in the app.' }
        : { kind: 'error', message: r.message },
    );
  }

  return (
    <main style={box}>
      <h1>Reset your password</h1>
      {state.kind === 'done' ? (
        <p role="status">{state.message}</p>
      ) : token ? (
        <form method="post" onSubmit={setPassword}>
          <label>
            New password ({PASSWORD_MIN}+ characters)
            <input
              style={input}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN}
              maxLength={PASSWORD_MAX}
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              style={input}
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
            />
          </label>
          <button disabled={state.kind === 'busy'}>Set new password</button>
        </form>
      ) : (
        <form method="post" onSubmit={requestLink}>
          <label>
            Email
            <input style={input} name="email" type="email" autoComplete="email" required />
          </label>
          <button disabled={state.kind === 'busy'}>Send reset link</button>
        </form>
      )}
      {state.kind === 'error' && <p role="alert">{state.message}</p>}
    </main>
  );
}
