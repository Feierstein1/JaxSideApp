import Link from 'next/link';
import { notFound } from 'next/navigation';
import { COLORS } from '@jax/shared';
import { ApiError } from '@/server/http';
import { can, myPlaces, requirePlace, type Ability } from '@/server/places';
import { TEXT } from '@/text';
import { requireAccount } from '../../require-account';
import { SignOutButton } from '../../sign-out-button';

const SECTIONS: Ability[] = ['discussion', 'team', 'ads', 'insights', 'billing'];
/** Sections that have their own page so far (the rest say "coming soon"). */
const BUILT: Partial<Record<Ability, string>> = { discussion: 'discussion', team: 'team' };

/** B1.4: one place. 🔒 Only accounts with access see it; anyone else gets "not found". */
export default async function PlacePage({ params }: { params: Promise<{ placeId: string }> }) {
  const account = await requireAccount();
  const { placeId } = await params;
  let place;
  try {
    place = await requirePlace(account.id, placeId);
  } catch (err) {
    if (err instanceof ApiError) notFound();
    throw err;
  }
  const several = (await myPlaces(account.id)).length > 1;
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px' }}>
      {several ? <Link href="/">{TEXT.places.back}</Link> : null}
      <h1 style={{ marginBottom: 4 }}>{place.name}</h1>
      <p style={{ marginTop: 0, color: COLORS.textMuted }}>
        {[place.address, TEXT.roles[place.role]].filter(Boolean).join(' · ')}
      </p>
      <ul style={{ paddingLeft: 18 }}>
        {SECTIONS.filter((s) => can(place.role, s)).map((s) => (
          <li key={s} style={{ marginBottom: 8 }}>
            {s in BUILT ? (
              <Link href={`/places/${place.id}/${BUILT[s]}`}>
                <strong>{TEXT.places.sections[s]}</strong>
              </Link>
            ) : (
              <>
                <strong>{TEXT.places.sections[s]}</strong>{' '}
                <span style={{ color: COLORS.textMuted }}>{TEXT.places.soon}</span>
              </>
            )}
          </li>
        ))}
      </ul>
      <p>
        <Link href="/security">{TEXT.home.security}</Link>
      </p>
      <SignOutButton />
    </main>
  );
}
