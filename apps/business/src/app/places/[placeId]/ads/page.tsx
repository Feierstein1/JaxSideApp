import Link from 'next/link';
import { notFound } from 'next/navigation';
import { COLORS } from '@jax/shared';
import { listAds } from '@/server/ads';
import { ApiError } from '@/server/http';
import { can, requirePlace } from '@/server/places';
import { TEXT } from '@/text';
import { requireAccount } from '../../../require-account';
import { AdActions } from './ad-actions';

/** B3.2: this place's ads, with the library and plan numbers for the whole business. */
export default async function AdsPage({ params }: { params: Promise<{ placeId: string }> }) {
  const account = await requireAccount();
  const { placeId } = await params;
  let place;
  try {
    place = await requirePlace(account.id, placeId, 'ads');
  } catch (err) {
    if (err instanceof ApiError) notFound();
    throw err;
  }
  const lib = await listAds(account);
  const ads = lib.ads.filter((a) => a.placeId === place.id);
  const owner = can(place.role, 'publishAds');
  const card = {
    padding: 16,
    background: COLORS.background,
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: 12,
  };
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '48px 16px' }}>
      <Link href={`/places/${place.id}`}>← {place.name}</Link>
      <h1>{TEXT.ads.libraryTitle}</h1>
      <p style={{ color: COLORS.textMuted }}>
        {lib.planName
          ? TEXT.ads.planLine(lib.planName, lib.running, lib.planLimit)
          : TEXT.ads.noPlan}{' '}
        · {TEXT.ads.savedLine(lib.saved, lib.libraryMax)}
      </p>
      <p>
        {lib.saved < lib.libraryMax ? (
          <Link href={`/places/${place.id}/ads/new`}>{TEXT.ads.newAd}</Link>
        ) : (
          <span style={{ color: COLORS.textMuted }}>{TEXT.ads.libraryFull}</span>
        )}{' '}
        · <Link href="/ads/templates">{TEXT.ads.seeTemplates}</Link>
      </p>
      {ads.length === 0 ? <p>{TEXT.ads.none}</p> : null}
      <div style={{ display: 'grid', gap: 12 }}>
        {ads.map((a) => (
          <div key={a.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <Link href={`/places/${place.id}/ads/${a.id}`}>
                <strong>{a.headline || TEXT.ads.untitled}</strong>
              </Link>
              <span style={{ fontWeight: 700 }}>{TEXT.ads.states[a.state]}</span>
            </div>
            <div style={{ color: COLORS.textMuted, fontSize: 14, marginTop: 4 }}>
              {TEXT.ads.templateNames[a.template]} · {a.schedule}
            </div>
            {a.rejectedBecause !== null ? (
              <p style={{ color: COLORS.error }}>
                {TEXT.ads.rejected}
                {a.rejectedBecause ? `: ${a.rejectedBecause}` : ''}
              </p>
            ) : null}
            <AdActions adId={a.id} status={a.status} state={a.state} owner={owner} />
          </div>
        ))}
      </div>
    </main>
  );
}
