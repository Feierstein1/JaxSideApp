'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AdDisplayState } from '@jax/shared';
import { TEXT } from '@/text';
import { post } from '../../../client';
import { ui } from '../../../ui';

type Status = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'PAUSED' | 'ENDED';

/** The buttons under an ad in the library (the server checks every one of them again). */
export function AdActions({
  adId,
  status,
  state,
  owner,
}: {
  adId: string;
  status: Status;
  state: AdDisplayState;
  owner: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function run(path: string, body: object, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setError(undefined);
    try {
      await post(path, body);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : TEXT.common.failed);
    } finally {
      setBusy(false);
    }
  }
  const button = (label: string, onClick: () => void) => (
    <button type="button" style={ui.secondary} disabled={busy} onClick={onClick}>
      {label}
    </button>
  );
  const move = (m: string, confirm?: string) => run(`/api/ads/${adId}/move`, { move: m }, confirm);

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {owner && status === 'DRAFT'
          ? button(TEXT.ads.submit, () =>
              run(`/api/ads/${adId}/submit`, {}, TEXT.ads.submitConfirm),
            )
          : null}
        {owner && status === 'PENDING_REVIEW'
          ? button(TEXT.ads.withdraw, () => move('withdraw'))
          : null}
        {owner && status === 'APPROVED' && state !== 'ENDED'
          ? button(TEXT.ads.pause, () => move('pause'))
          : null}
        {owner && status === 'PAUSED' ? button(TEXT.ads.resume, () => move('resume')) : null}
        {owner && (status === 'APPROVED' || status === 'PAUSED') && state !== 'ENDED'
          ? button(TEXT.ads.end, () => move('end', TEXT.ads.endConfirm))
          : null}
        {state !== 'LIVE' && state !== 'SCHEDULED'
          ? button(TEXT.ads.delete, () =>
              run(`/api/ads/${adId}/delete`, {}, TEXT.ads.deleteConfirm),
            )
          : null}
      </div>
      {error ? (
        <p role="alert" style={ui.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
