'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { TEXT } from '@/text';
import { post } from '../client';
import { ui } from '../ui';

/** Create the business account, or (signed in) add the place to this account. */
export function InviteForm({ token, signedInAs }: { token: string; signedInAs: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : TEXT.common.failed);
    } finally {
      setBusy(false);
    }
  }

  const errorLine = error && (
    <p role="alert" style={ui.error}>
      {error}
    </p>
  );

  if (signedInAs) {
    return (
      <>
        <p style={ui.muted}>
          {TEXT.home.signedInAs} {signedInAs}
        </p>
        {errorLine}
        <button
          type="button"
          disabled={busy}
          style={ui.primary}
          onClick={() => run(async () => void (await post('/api/invites/accept', { token })))}
        >
          {TEXT.invite.addToAccount}
        </button>
      </>
    );
  }

  const create = (e: FormEvent) => {
    e.preventDefault();
    if (password !== again) {
      setError(TEXT.invite.mismatch);
      return;
    }
    return run(
      async () => void (await post('/api/invites/accept-new', { token, email, password })),
    );
  };

  return (
    <form onSubmit={create}>
      <p style={ui.muted}>{TEXT.invite.separate}</p>
      <label style={ui.label}>
        {TEXT.invite.email}
        <input
          style={ui.input}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label style={ui.label}>
        {TEXT.login.password}
        <input
          style={ui.input}
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      <label style={ui.label}>
        {TEXT.invite.passwordAgain}
        <input
          style={ui.input}
          type="password"
          autoComplete="new-password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          required
        />
      </label>
      <p style={ui.muted}>{TEXT.password.rule}</p>
      {errorLine}
      <button type="submit" disabled={busy} style={ui.primary}>
        {busy ? TEXT.common.saving : TEXT.invite.create}
      </button>
    </form>
  );
}
