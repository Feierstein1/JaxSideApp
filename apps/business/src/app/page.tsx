import Link from 'next/link';
import { redirect } from 'next/navigation';
import { COLORS } from '@jax/shared';
import { unreadCount } from '@/server/inbox';
import { myPlaces } from '@/server/places';
import { TEXT } from '@/text';
import { requireAccount } from './require-account';
import { SignOutButton } from './sign-out-button';

/** B1.4: one place opens straight in; several show a list. */
export default async function HomePage() {
  const account = await requireAccount();
  const places = await myPlaces(account.id);
  if (places.length === 1) redirect(`/places/${places[0]!.id}`);
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px' }}>
      <h1 style={{ marginTop: 0 }}>{TEXT.places.title}</h1>
      <p style={{ color: COLORS.textMuted }}>
        {TEXT.home.signedInAs} {account.email ?? account.username}
      </p>
      {places.length === 0 ? <p>{TEXT.places.none}</p> : null}
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
        {places.map((p) => (
          <li key={p.id}>
            <Link
              href={`/places/${p.id}`}
              style={{
                display: 'block',
                padding: 16,
                background: COLORS.background,
                border: `1px solid ${COLORS.cardBorder}`,
                borderRadius: 12,
                color: COLORS.text,
                textDecoration: 'none',
              }}
            >
              <strong>{p.name}</strong>
              <span style={{ display: 'block', color: COLORS.textMuted }}>
                {[p.address, TEXT.roles[p.role]].filter(Boolean).join(' · ')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p>
        <Link href="/inbox">{TEXT.inbox.link(await unreadCount(account))}</Link>
      </p>
      <p>
        <Link href="/security">{TEXT.home.security}</Link>
      </p>
      <SignOutButton />
    </main>
  );
}
