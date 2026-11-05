import { CONFIG_DEFAULTS } from '@jax/shared';
import { adminRatingActivity } from '@/server/directory/ratings';
import { ui } from '../../admin-ui';
import { PlaceRatingControls } from '../../forms';
import { requireAdminPage } from '../../require-admin-page';
import { Pager, Pill, Table, td } from '../admin-table';
import { pageNumber } from '@/server/admin/paging';

export const dynamic = 'force-dynamic';

/**
 * D144: place ratings (like / dislike, only from people at the place). The places with the
 * most voting this week, busiest in the last day first, so a sudden pile-on stands out;
 * locked places always listed. Lock pauses voting; Clear deletes every vote on the place.
 */
export default async function RatingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPage();
  const list = await adminRatingActivity(pageNumber((await searchParams).page));
  const rows = list.rows;
  return (
    <>
      <h1>Place ratings</h1>
      <p style={ui.muted}>
        People can like or dislike a place only while they’re there, once each (they can change it).
        The % liked shows in the app after {CONFIG_DEFAULTS['places.ratingMinVotes']} votes. A lot
        of votes in one day can mean a pile-on: lock voting while you look, or clear the votes.
      </p>
      {list.total === 0 ? (
        <p style={ui.muted}>No votes in the last week.</p>
      ) : (
        <Table head={['Place', 'Liked', 'Votes', 'Last 24 h', 'Last 7 days', '']}>
          {rows.map((r) => {
            const votes = r.likes + r.dislikes;
            return (
              <tr key={r.id}>
                <td style={td}>
                  {r.name} {r.locked ? <Pill tone="alert">locked</Pill> : null}
                </td>
                <td style={td}>{votes ? `${Math.round((r.likes * 100) / votes)}%` : '—'}</td>
                <td style={td}>
                  {votes} ({r.likes} 👍 / {r.dislikes} 👎)
                </td>
                <td style={td}>{r.votesLastDay}</td>
                <td style={td}>{r.votesLastWeek}</td>
                <td style={td}>
                  <PlaceRatingControls placeId={r.id} locked={r.locked} />
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      <Pager page={list} base="/admin/ratings" params={{}} />
    </>
  );
}
