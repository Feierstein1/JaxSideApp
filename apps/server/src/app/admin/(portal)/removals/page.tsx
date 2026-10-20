import { listRemovals } from '@/server/directory/place-changes';
import { ui } from '../../admin-ui';
import { RemovalActions } from '../../forms';
import { requireAdminPage } from '../../require-admin-page';
import { when } from '../admin-table';

export const dynamic = 'force-dynamic';

const TABS = ['OPEN', 'REMOVED', 'KEPT', 'EXPIRED'] as const;
const LABEL = { OPEN: 'Voting', REMOVED: 'Removed', KEPT: 'Kept', EXPIRED: 'Expired' } as const;

/**
 * D94: "closed / doesn't exist" requests and their votes (who, which way, how far away), so
 * a group voting to remove a real place stands out. Keep (restore) or remove any of them.
 */
export default async function RemovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminPage();
  const q = await searchParams;
  const status = TABS.find((t) => t === q.status) ?? 'OPEN';
  const rows = await listRemovals(status);
  return (
    <>
      <h1>Place removals</h1>
      <p style={ui.muted}>
        People near a place vote “Closed” or “Still open”; 10 votes one way decide it. Every vote is
        listed here.
      </p>
      <nav style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
        {TABS.map((t) => (
          <a
            key={t}
            href={`/admin/removals?status=${t}`}
            style={{ fontWeight: t === status ? 800 : 400 }}
          >
            {LABEL[t]}
          </a>
        ))}
      </nav>
      {rows.length === 0 ? <p style={ui.muted}>Nothing here.</p> : null}
      <div style={{ display: 'grid', gap: 16 }}>
        {rows.map((r) => {
          const closed = r.votes.filter((v) => v.support).length;
          return (
            <div key={r.id} style={ui.card}>
              <p style={{ marginTop: 0 }}>
                <strong>{r.place.name}</strong> ({r.place.category.replaceAll('_', ' ')}) · asked by{' '}
                <a href={`/admin/users/${r.requester.id}`}>@{r.requester.username}</a> ·{' '}
                {when(r.createdAt.toISOString())}
                {r.resolvedBy ? ` · decided by @${r.resolvedBy.username}` : ''}
              </p>
              <p>
                <strong>{closed}</strong> closed · <strong>{r.votes.length - closed}</strong> still
                open
              </p>
              <details>
                <summary>Votes ({r.votes.length})</summary>
                <ul>
                  {r.votes.map((v) => (
                    <li key={v.voter.id}>
                      <a href={`/admin/users/${v.voter.id}`}>@{v.voter.username}</a>:{' '}
                      {v.support ? 'Closed' : 'Still open'} · {v.distanceMeters} m away ·{' '}
                      {when(v.createdAt.toISOString())}
                    </li>
                  ))}
                </ul>
              </details>
              <RemovalActions id={r.id} status={r.status} />
            </div>
          );
        })}
      </div>
    </>
  );
}
