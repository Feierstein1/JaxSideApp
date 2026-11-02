import Link from 'next/link';
import { notFound } from 'next/navigation';
import { COLORS } from '@jax/shared';
import { ApiError } from '@/server/http';
import { requirePlace } from '@/server/places';
import { teamFor } from '@/server/team';
import { TEXT } from '@/text';
import { requireAccount } from '../../../require-account';
import { AddMemberForm, MemberActions } from './team-forms';

/** B1.5: the place's team. Only its Owner sees this page; anyone else gets "not found". */
export default async function TeamPage({ params }: { params: Promise<{ placeId: string }> }) {
  const account = await requireAccount();
  const { placeId } = await params;
  let place;
  let team;
  try {
    place = await requirePlace(account.id, placeId, 'team');
    team = await teamFor(account, placeId);
  } catch (err) {
    if (err instanceof ApiError) notFound();
    throw err;
  }
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px' }}>
      <Link href={`/places/${place.id}`}>← {place.name}</Link>
      <h1>{TEXT.team.title}</h1>
      <p style={{ color: COLORS.textMuted }}>{TEXT.team.intro}</p>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
        {team.map((m) => (
          <li
            key={m.accountId}
            style={{
              padding: 16,
              background: COLORS.background,
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 12,
            }}
          >
            <strong>{m.signInName}</strong>{' '}
            <span style={{ color: COLORS.textMuted }}>
              {TEXT.roles[m.role]}
              {m.staffName ? ` · ${TEXT.team.shownAs(m.staffName)}` : ''}
              {m.mustChangePassword ? ` · ${TEXT.team.notSignedInYet}` : ''}
              {m.isMe ? ` · ${TEXT.team.you}` : ''}
            </span>
            {m.manageable ? (
              <MemberActions
                placeId={place.id}
                accountId={m.accountId}
                role={m.role as 'MANAGER' | 'STAFF'}
                staffName={m.staffName}
              />
            ) : null}
          </li>
        ))}
      </ul>
      <h2>{TEXT.team.addTitle}</h2>
      <AddMemberForm placeId={place.id} />
    </main>
  );
}
