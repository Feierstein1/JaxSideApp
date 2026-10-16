'use client';

import { useState, type FormEvent } from 'react';
import { TopBar, ui } from '../admin-ui';

type Enroll = { secret: string; otpauthUrl: string; qrSvg: string } | null;

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message ?? 'Something went wrong');
  return json as T;
}

/** P5.11: admin sign-in: password, then the authenticator code (set up on first sign-in). */
export default function AdminLogin() {
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState('');
  const [enroll, setEnroll] = useState<Enroll>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const r = await post<{ challenge: string; enroll: Enroll }>('/api/v1/admin/login', {
        identifier,
        password,
      });
      setPassword('');
      setChallenge(r.challenge);
      setEnroll(r.enroll);
      setStep('code');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await post('/api/v1/admin/login/verify', { challenge, code });
      window.location.href = '/admin';
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div style={ui.page}>
      <TopBar />
      <main style={{ ...ui.main, maxWidth: 440 }}>
        <div style={ui.card}>
          {step === 'password' ? (
            <form onSubmit={submitPassword}>
              <h1 style={{ marginTop: 0 }}>Sign in</h1>
              <label style={ui.label}>
                Username or email
                <input
                  style={ui.input}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label style={ui.label}>
                Password
                <input
                  style={ui.input}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              {error ? (
                <p role="alert" style={ui.error}>
                  {error}
                </p>
              ) : null}
              <button style={ui.button} disabled={busy}>
                Continue
              </button>
            </form>
          ) : (
            <form onSubmit={submitCode}>
              <h1 style={{ marginTop: 0 }}>
                {enroll ? 'Set up two-step sign-in' : 'Authenticator code'}
              </h1>
              {enroll ? (
                <>
                  <p>
                    Scan this with an authenticator app (Google Authenticator, Microsoft
                    Authenticator, 1Password…), then enter the 6-digit code it shows.
                  </p>
                  <div
                    style={{ width: 200, margin: '0 auto' }}
                    dangerouslySetInnerHTML={{ __html: enroll.qrSvg }}
                  />
                  <p style={ui.muted}>
                    Can’t scan? Enter this key:{' '}
                    <code style={{ wordBreak: 'break-all' }}>{enroll.secret}</code>
                  </p>
                </>
              ) : (
                <p>Enter the 6-digit code from your authenticator app.</p>
              )}
              <label style={ui.label}>
                Code
                <input
                  style={ui.input}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  required
                  autoFocus
                />
              </label>
              {error ? (
                <p role="alert" style={ui.error}>
                  {error}
                </p>
              ) : null}
              <button style={ui.button} disabled={busy}>
                Sign in
              </button>{' '}
              <button
                type="button"
                style={ui.buttonSecondary}
                onClick={() => {
                  setStep('password');
                  setCode('');
                  setError(undefined);
                }}
              >
                Back
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
