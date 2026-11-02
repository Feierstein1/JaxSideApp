'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TEXT } from '@/text';
import { post } from '../client';
import { ui } from '../ui';

/** "Mark as seen" for one place, or (no placeId) everything. */
export function MarkSeenButton({ placeId }: { placeId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      style={ui.secondary}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await post('/api/inbox/seen', placeId ? { placeId } : {});
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {placeId ? TEXT.inbox.markPlaceSeen : TEXT.inbox.markAllSeen}
    </button>
  );
}

/** The daily summary email switch. */
export function EmailNoticesSwitch({ on, hasEmail }: { on: boolean; hasEmail: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!hasEmail) return <p style={ui.muted}>{TEXT.inbox.noEmail}</p>;
  return (
    <>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={on}
          disabled={busy}
          onChange={async (e) => {
            setBusy(true);
            setError(undefined);
            try {
              await post('/api/account/notices', { on: e.target.checked });
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : TEXT.common.failed);
            } finally {
              setBusy(false);
            }
          }}
        />
        {TEXT.inbox.emailSwitch}
      </label>
      {error ? (
        <p role="alert" style={ui.error}>
          {error}
        </p>
      ) : null}
    </>
  );
}
