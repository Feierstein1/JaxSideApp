import { listGiveaways } from '@/server/giveaways';
import { ui } from '../../admin-ui';
import { requireAdminPage } from '../../require-admin-page';
import { Pill, StatGrid, StatTile, Table, td, when } from '../admin-table';
import { PHASE_TONE, WINNER_STATUS } from './labels';

export const dynamic = 'force-dynamic';

/** D188: every giveaway and its winners. */
export default async function GiveawaysPage() {
  await requireAdminPage();
  const giveaways = await listGiveaways();
  const winners = giveaways.flatMap((g) => g.winners);
  const toSend = winners.filter((w) => w.status === 'ACCEPTED').length;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1>Giveaways</h1>
        <a href="/admin/giveaways/new" style={{ ...ui.button, textDecoration: 'none' }}>
          New giveaway
        </a>
      </div>
      <StatGrid min={170}>
        <StatTile label="Giveaways" value={giveaways.length} />
        <StatTile label="Open now" value={giveaways.filter((g) => g.phase === 'Open').length} />
        <StatTile label="Prizes to send" value={toSend} alert={toSend > 0} />
        <StatTile
          label="Prizes sent"
          value={winners.filter((w) => w.status === 'PRIZE_SENT').length}
        />
      </StatGrid>
      {giveaways.length === 0 ? (
        <p style={ui.muted}>No giveaways yet.</p>
      ) : (
        <Table head={['Giveaway', 'Status', 'Entry period', 'Pick', 'Winners']}>
          {giveaways.map((g) => (
            <tr key={g.id}>
              <td style={td}>
                <a href={`/admin/giveaways/${g.id}`}>{g.title}</a>
                <div style={ui.muted}>{g.prize}</div>
              </td>
              <td style={td}>
                <Pill tone={PHASE_TONE[g.phase]}>{g.phase}</Pill>
              </td>
              <td style={td}>
                {when(g.startsAt.toISOString())} – {when(g.endsAt.toISOString())}
              </td>
              <td style={td}>{g.pickMethod === 'RANDOM' ? 'Random draw' : 'By hand'}</td>
              <td style={td}>
                {g.winners.length === 0 ? (
                  <span style={ui.muted}>None yet ({g.winnerCount} to pick)</span>
                ) : (
                  g.winners.map((w) => (
                    <div key={w.id}>
                      <a href={`/admin/users/${w.user.id}`}>@{w.user.username}</a>{' '}
                      <Pill tone={WINNER_STATUS[w.status]!.tone}>
                        {WINNER_STATUS[w.status]!.label}
                      </Pill>
                    </div>
                  ))
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
