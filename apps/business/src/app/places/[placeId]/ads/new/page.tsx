import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@/server/http';
import { can, requirePlace } from '@/server/places';
import { TEXT } from '@/text';
import { requireAccount } from '../../../../require-account';
import { AdEditor } from '../ad-editor';

/** B3.2: a new ad (starts as a draft; the Owner sends it for approval). */
export default async function NewAdPage({ params }: { params: Promise<{ placeId: string }> }) {
  const account = await requireAccount();
  const { placeId } = await params;
  let place;
  try {
    place = await requirePlace(account.id, placeId, 'ads');
  } catch (err) {
    if (err instanceof ApiError) notFound();
    throw err;
  }
  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 16px' }}>
      <Link href={`/places/${place.id}/ads`}>← {TEXT.ads.libraryTitle}</Link>
      <h1>{TEXT.ads.newAd}</h1>
      <AdEditor
        placeName={place.name}
        owner={can(place.role, 'publishAds')}
        initial={{
          placeId: place.id,
          template: 'POST',
          headline: '',
          body: null,
          mediaId: null,
          mediaUrl: null,
          adultsOnly: false,
          startsAt: null,
          endsAt: null,
          daysOfWeek: 127,
          dailyStartMin: null,
          dailyEndMin: null,
          radiusMeters: 1600,
          zips: [],
        }}
      />
    </main>
  );
}
