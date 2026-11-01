'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { TEXT } from '@/text';
import { post } from '../client';
import { Card, ui } from '../ui';

type LoginAnswer = { twoFactor?: true; challenge?: string };

/** Sign-in: email or username and password, then the authenticator code if it's on. */
export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<string>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : TEXT.common.failed);
    } finally {
      setBusy(false);
    }
  }

  function done() {
    router.replace('/');
    router.refresh();
  }

  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const r = await post<LoginAnswer>('/api/auth/login', { identifier, password });
      setPassword('');
      if (r.twoFactor && r.challenge) setChallenge(r.challenge);
      else done();
    });
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await post('/api/auth/two-factor/login', { challenge, code });
      done();
    });
  };

  if (challenge) {
    return (
      <Card>
        <form onSubmit={submitCode}>
          <h1 style={{ marginTop: 0 }}>{TEXT.login.codeTitle}</h1>
          <p style={ui.muted}>{TEXT.login.codeHelp}</p>
          <label style={ui.label}>
            {TEXT.login.code}
            <input
              style={ui.input}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
          {error && (
            <p role="alert" style={ui.error}>
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} style={ui.primary}>
            {busy ? TEXT.login.busy : TEXT.login.codeSubmit}
          </button>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={submitPassword}>
        <h1 style={{ marginTop: 0 }}>{TEXT.login.title}</h1>
        <label style={ui.label}>
          {TEXT.login.identifier}
          <input
            style={ui.input}
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
        </label>
        <label style={ui.label}>
          {TEXT.login.password}
          <input
            style={ui.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p role="alert" style={ui.error}>
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} style={ui.primary}>
          {busy ? TEXT.login.busy : TEXT.login.submit}
        </button>
      </form>
    </Card>
  );
}
