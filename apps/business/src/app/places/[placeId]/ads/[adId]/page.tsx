import Link from 'next/link';
import { notFound } from 'next/navigation';
import { COLORS } from '@jax/shared';
import { getAd } from '@/server/ads';
import { ApiError } from '@/server/http';
import { can, requirePlace } from '@/server/places';
import { TEXT } from '@/text';
import { requireAccount } from '../../../../require-account';
import { AdEditor } from '../ad-editor';

/** B3.2: edit an ad (an approved one goes back for approval when saved). */
export default async function EditAdPage({
  params,
}: {
  params: Promise<{ placeId: string; adId: string }>;
}) {
  const account = await requireAccount();
  const { placeId, adId } = await params;
  let place;
  let ad;
  try {
    place = await requirePlace(account.id, placeId, 'ads');
    ad = await getAd(account, adId);
  } catch (err) {
    if (err instanceof ApiError) notFound();
    throw err;
  }
  if (ad.placeId !== place.id) notFound();
  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 16px' }}>
      <Link href={`/places/${place.id}/ads`}>← {TEXT.ads.libraryTitle}</Link>
      <h1 style={{ marginBottom: 4 }}>{ad.headline || TEXT.ads.untitled}</h1>
      <p style={{ marginTop: 0, color: COLORS.textMuted }}>
        {TEXT.ads.states[ad.state]} · {ad.schedule}
      </p>
      {ad.rejectedBecause !== null ? (
        <p style={{ color: COLORS.error }}>
          {TEXT.ads.rejected}
          {ad.rejectedBecause ? `: ${ad.rejectedBecause}` : ''}
        </p>
      ) : null}
      <AdEditor
        placeName={place.name}
        owner={can(place.role, 'publishAds')}
        initial={{
          id: ad.id,
          status: ad.status,
          placeId: ad.placeId,
          template: ad.template,
          headline: ad.headline,
          body: ad.body,
          mediaId: ad.mediaId,
          mediaUrl: ad.mediaUrl,
          adultsOnly: ad.adultsOnly,
          startsAt: ad.startsAt,
          endsAt: ad.endsAt,
          daysOfWeek: ad.daysOfWeek,
          dailyStartMin: ad.dailyStartMin,
          dailyEndMin: ad.dailyEndMin,
          radiusMeters: ad.radiusMeters,
          zips: ad.zips,
        }}
      />
    </main>
  );
}
