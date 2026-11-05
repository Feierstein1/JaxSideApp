import { listPendingAds } from '@/server/admin/ad-review';
import { ui } from '../../admin-ui';
import { AdDecisionForm } from '../../business-forms';
import { requireAdminPage } from '../../require-admin-page';
import { Pill, when, words } from '../admin-table';

export const dynamic = 'force-dynamic';

/**
 * B3.3 / D206: ads waiting for approval, oldest first. Approving puts the ad live on its
 * schedule; turning one down sends it back to the business with the reason.
 */
export default async function AdsPage() {
  await requireAdminPage();
  const ads = await listPendingAds();
  return (
    <>
      <h1>Ads to review</h1>
      <p style={ui.muted}>
        Every ad is checked before it shows in the app. Approve it, or turn it down and say what
        needs to change (the business sees your reason).
      </p>
      {ads.length === 0 ? <p style={ui.muted}>Nothing waiting.</p> : null}
      <div style={{ display: 'grid', gap: 16 }}>
        {ads.map((a) => (
          <div key={a.id} style={ui.card}>
            <p style={{ marginTop: 0 }}>
              <Pill>{words(a.template)}</Pill>
              {a.adultsOnly ? <Pill tone="alert">21+</Pill> : null} <strong>{a.place.name}</strong>
              <span style={ui.muted}> · {a.place.address ?? ''}</span>
            </p>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {a.imageUrl ? (
                <img
                  src={a.imageUrl}
                  alt="The ad’s image"
                  style={{ maxWidth: 240, maxHeight: 240, borderRadius: 8, objectFit: 'contain' }}
                />
              ) : null}
              <div style={{ flex: 1, minWidth: 240 }}>
                <h2 style={{ margin: '0 0 6px' }}>{a.headline}</h2>
                {a.body ? <p style={{ whiteSpace: 'pre-wrap' }}>{a.body}</p> : null}
                <p style={ui.muted}>
                  Runs {a.schedule}
                  {a.startsAt ? ` · from ${when(a.startsAt)}` : ''}
                  {a.endsAt ? ` · until ${when(a.endsAt)}` : ''}
                  <br />
                  Shown to: {a.reach}
                  <br />
                  From <a href={`/admin/businesses/${a.business.id}`}>{a.business.email}</a>
                  {a.madeBy ? ` (made by ${a.madeBy})` : ''}
                  {a.submittedAt ? ` · sent ${when(a.submittedAt)}` : ''}
                </p>
              </div>
            </div>
            <AdDecisionForm adId={a.id} />
          </div>
        ))}
      </div>
    </>
  );
}
