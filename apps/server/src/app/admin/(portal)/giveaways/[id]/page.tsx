import { uuidParam } from '@/server/admin/params';
import { POOL_PAGE_SIZE, getGiveaway } from '@/server/giveaways';
import { ui } from '../../../admin-ui';
import { GiveawayActions, WinnerActions } from '../../../giveaway-forms';
import { requireAdminPage } from '../../../require-admin-page';
import { Pill, Table, td, when } from '../../admin-table';
import { PHASE_TONE, WINNER_STATUS } from '../labels';

export const dynamic = 'force-dynamic';

/** D188: one giveaway: its criteria, picking winners, the winners, and who is eligible. */
export default async function GiveawayPage(ctx: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPage();
  const id = await uuidParam(ctx);
  const pageParam = Number((await ctx.searchParams).page);
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const { giveaway: g, phase, openSlots, pool } = await getGiveaway(id, page);
  const pages = Math.max(1, Math.ceil(pool.total / POOL_PAGE_SIZE));
  const day = (d: Date | null) => (d ? when(d.toISOString()) : '');
  const criteria = [
    g.minPosts ? `At least ${g.minPosts} posts` : null,
    g.minPostDays ? `Posts on at least ${g.minPostDays} different days` : null,
    g.minComments ? `At least ${g.minComments} comments` : null,
    g.minApprovedPlaces ? `At least ${g.minApprovedPlaces} approved place suggestions` : null,
    g.requireConfirmedEmail ? 'Confirmed email' : null,
    g.requireNoStrikes ? 'No strikes that still count' : null,
    g.joinedAfter ? `Joined on or after ${day(g.joinedAfter)}` : null,
    g.joinedBefore ? `Joined before ${day(g.joinedBefore)}` : null,
    g.minAccountAgeDays ? `Account at least ${g.minAccountAgeDays} days old` : null,
    g.excludePastWinners ? 'Hasn’t won a giveaway before' : null,
    g.minActiveDays ? `Opened the app on at least ${g.minActiveDays} days` : null,
  ].filter((c): c is string => !!c);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <a href="/admin/giveaways">← Giveaways</a>
      <div style={ui.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>{g.title}</h1>
          <Pill tone={PHASE_TONE[phase]}>{phase}</Pill>
        </div>
        <p style={{ fontSize: 16, fontWeight: 600 }}>{g.prize}</p>
        <p style={ui.muted}>
          Entry period {day(g.startsAt)} – {day(g.endsAt)} ·{' '}
          {g.pickMethod === 'RANDOM'
            ? g.ticketsPerActiveDay
              ? 'random draw, a ticket per day in the app'
              : 'random draw'
            : 'picked by hand'}{' '}
          · {g.winnerCount} {g.winnerCount === 1 ? 'winner' : 'winners'} · {g.respondDays} days to
          accept · created by @{g.createdBy.username}
        </p>
        <h3>Who can win</h3>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Active account (not banned or suspended), not an admin</li>
          {criteria.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        {g.notes ? (
          <>
            <h3>Notes</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{g.notes}</p>
          </>
        ) : null}
      </div>

      <GiveawayActions
        id={g.id}
        pickMethod={g.pickMethod}
        canPick={new Date() >= g.endsAt}
        openSlots={openSlots}
        cancelled={g.status === 'CANCELLED'}
      />

      <h2 style={{ marginBottom: 0 }}>Winners</h2>
      {g.winners.length === 0 ? (
        <p style={ui.muted}>None picked yet.</p>
      ) : (
        <Table head={['Winner', 'Status', 'Picked', 'Answer by', 'Notes', '']}>
          {g.winners.map((w) => (
            <tr key={w.id}>
              <td style={td}>
                <a href={`/admin/users/${w.user.id}`}>@{w.user.username}</a>
                {w.user.status !== 'ACTIVE' ? (
                  <div>
                    <Pill tone="alert">account {w.user.status.toLowerCase()}</Pill>
                  </div>
                ) : null}
              </td>
              <td style={td}>
                <Pill tone={WINNER_STATUS[w.status]!.tone}>{WINNER_STATUS[w.status]!.label}</Pill>
                {w.prizeSentAt ? <div style={ui.muted}>{day(w.prizeSentAt)}</div> : null}
              </td>
              <td style={td}>
                {day(w.createdAt)}
                <div style={ui.muted}>
                  {w.pickedBy === 'RANDOM'
                    ? w.tickets && w.poolTickets
                      ? `drawn from ${w.poolSize} (${w.tickets} of ${w.poolTickets} tickets)`
                      : `drawn from ${w.poolSize}`
                    : `by @${w.pickedByUser.username}`}
                </div>
              </td>
              <td style={td}>
                {w.respondedAt ? `answered ${day(w.respondedAt)}` : day(w.respondBy)}
              </td>
              <td style={{ ...td, maxWidth: 220 }}>
                {w.adminNote ?? ''}
                {w.emailRevealedAt ? (
                  <div style={ui.muted}>email shown {day(w.emailRevealedAt)}</div>
                ) : null}
              </td>
              <td style={td}>
                <WinnerActions giveawayId={g.id} winnerId={w.id} status={w.status} />
              </td>
            </tr>
          ))}
        </Table>
      )}

      <h2 style={{ marginBottom: 0 }}>
        Eligible accounts ({pool.total}
        {g.ticketsPerActiveDay ? `, ${pool.tickets} tickets` : ''})
      </h2>
      <p style={{ ...ui.muted, margin: 0 }}>
        Counted over the entry period{phase === 'Open' || phase === 'Upcoming' ? ', so far' : ''}.
        Accounts already picked for this giveaway aren’t listed.
      </p>
      {pool.rows.length === 0 ? (
        <p style={ui.muted}>No one meets the criteria.</p>
      ) : (
        <>
          <Table
            head={[
              'Account',
              'Joined',
              'Days in app',
              ...(g.ticketsPerActiveDay ? ['Tickets'] : []),
              'Posts',
              'Post days',
              'Comments',
              'Places',
            ]}
          >
            {pool.rows.map((r) => (
              <tr key={r.id}>
                <td style={td}>
                  <a href={`/admin/users/${r.id}`}>@{r.username}</a>
                </td>
                <td style={td}>{day(r.createdAt)}</td>
                <td style={td}>{r.activeDays}</td>
                {g.ticketsPerActiveDay ? <td style={td}>{r.tickets}</td> : null}
                <td style={td}>{r.posts}</td>
                <td style={td}>{r.postDays}</td>
                <td style={td}>{r.comments}</td>
                <td style={td}>{r.places}</td>
              </tr>
            ))}
          </Table>
          {pages > 1 ? (
            <nav style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              {page > 1 ? <a href={`?page=${page - 1}`}>← Previous</a> : null}
              <span style={ui.muted}>
                Page {page} of {pages}
              </span>
              {page < pages ? <a href={`?page=${page + 1}`}>Next →</a> : null}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
