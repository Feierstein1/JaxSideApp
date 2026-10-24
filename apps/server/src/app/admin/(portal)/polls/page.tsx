import { POLL_MIN_GROUP, type PollCounts } from '@jax/shared';
import { adminListPolls } from '@/server/polls';
import { ui } from '../../admin-ui';
import { PollActions, PollForm } from '../../poll-forms';
import { requireAdminPage } from '../../require-admin-page';
import { Table, td, when } from '../admin-table';

export const dynamic = 'force-dynamic';

const STATUS = { upcoming: 'Scheduled', open: 'Open', closed: 'Closed' } as const;
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');

/** One row of counts per choice, with percentages. */
function CountsRow({
  label,
  c,
  choices,
}: {
  label: string;
  c: PollCounts;
  choices: { id: string }[];
}) {
  return (
    <tr>
      <td style={td}>{label}</td>
      <td style={td}>{c.voters}</td>
      {choices.map((ch) => {
        const n = c.counts.find((x) => x.choiceId === ch.id)?.count ?? 0;
        return (
          <td key={ch.id} style={td}>
            {n} ({pct(n, c.voters)})
          </td>
        );
      })}
    </tr>
  );
}

/**
 * D123: weekly polls. Write one (question, choices, dates), edit or delete it until it opens,
 * end it early. While open only the number of votes shows; totals appear when it closes,
 * by ZIP where at least 10 people voted.
 */
export default async function PollsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string }>;
}) {
  await requireAdminPage();
  const q = await searchParams;
  const polls = await adminListPolls();
  const editing = q.edit ? polls.find((p) => p.id === q.edit && p.status === 'upcoming') : null;

  return (
    <>
      <h1>Polls</h1>
      <p style={ui.muted}>
        One question a week for people in Duval. Accounts vote once from inside the county; votes
        are anonymous once the poll closes. Results describe JaxSide users who voted, not a
        scientific survey of Jacksonville.
      </p>

      {editing ? (
        <>
          <h2>Edit poll</h2>
          <PollForm
            poll={{
              id: editing.id,
              question: editing.question,
              details: editing.details,
              choices: editing.choices.map((c) => c.label),
              opensAt: editing.opensAt,
              closesAt: editing.closesAt,
            }}
          />
        </>
      ) : q.new ? (
        <>
          <h2>New poll</h2>
          <PollForm />
        </>
      ) : (
        <p>
          <a href="/admin/polls?new=1" style={{ ...ui.button, textDecoration: 'none' }}>
            Write a new poll
          </a>
        </p>
      )}

      <div style={{ display: 'grid', gap: 16, marginTop: 20 }}>
        {polls.length === 0 ? <p style={ui.muted}>No polls yet.</p> : null}
        {polls.map((p) => (
          <div key={p.id} style={ui.card}>
            <p style={{ marginTop: 0, ...ui.muted, fontSize: 14 }}>
              <strong>{STATUS[p.status]}</strong> · {when(p.opensAt)} → {when(p.closesAt)}
              {p.createdBy ? ` · by @${p.createdBy}` : ''}
            </p>
            <h3 style={{ margin: '4px 0 8px' }}>{p.question}</h3>
            {p.details ? <p style={ui.muted}>{p.details}</p> : null}
            {p.results ? (
              <>
                <Table head={['', 'Voters', ...p.choices.map((c) => c.label)]}>
                  <CountsRow label="All of Duval" c={p.results} choices={p.choices} />
                  {p.results.areas.map((a) => (
                    <CountsRow key={a.zip} label={`ZIP ${a.zip}`} c={a} choices={p.choices} />
                  ))}
                  {p.results.otherAreas ? (
                    <CountsRow label="Other areas" c={p.results.otherAreas} choices={p.choices} />
                  ) : null}
                </Table>
                <p style={{ ...ui.muted, fontSize: 13 }}>
                  ZIP codes with fewer than {POLL_MIN_GROUP} voters are combined into “Other areas”,
                  which is hidden too when it’s under {POLL_MIN_GROUP}.
                </p>
              </>
            ) : (
              <>
                <ol style={{ margin: '0 0 10px' }}>
                  {p.choices.map((c) => (
                    <li key={c.id}>{c.label}</li>
                  ))}
                </ol>
                {p.status === 'open' ? (
                  <p style={ui.muted}>
                    {p.votesSoFar} {p.votesSoFar === 1 ? 'vote' : 'votes'} so far. Totals appear
                    when it closes.
                  </p>
                ) : null}
              </>
            )}
            <PollActions id={p.id} status={p.status} />
          </div>
        ))}
      </div>
    </>
  );
}
