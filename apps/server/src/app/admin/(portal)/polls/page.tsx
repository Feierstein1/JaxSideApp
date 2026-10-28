import {
  POLL_KINDS,
  POLL_MIN_GROUP,
  POLL_TOPICS,
  type PollCounts,
  type PollTopic,
} from '@jax/shared';
import { adminListPollSuggestions, adminListPolls } from '@/server/polls';
import { ui } from '../../admin-ui';
import { PollActions, PollForm, PollSuggestionActions } from '../../poll-forms';
import { requireAdminPage } from '../../require-admin-page';
import { Table, td, when } from '../admin-table';

export const dynamic = 'force-dynamic';

const STATUS = { upcoming: 'Scheduled', open: 'Open', closed: 'Closed' } as const;
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');

/** One row of counts per answer, as a share of voters (plus the average for ratings). */
function CountsRow({
  label,
  c,
  choices,
  rated,
}: {
  label: string;
  c: PollCounts;
  choices: { id: string }[];
  rated: boolean;
}) {
  return (
    <tr>
      <td style={td}>{label}</td>
      <td style={td}>{c.voters}</td>
      {rated ? <td style={td}>{c.average ?? '—'}</td> : null}
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
 * D123 / D124: weekly polls. Write one (type, topic, question, answers, dates), edit or delete
 * it until it opens, end it early. While open only the number of voters shows; totals appear
 * when it closes, by ZIP where at least 10 people voted. Filter by topic.
 */
export default async function PollsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string; topic?: string; q?: string; t?: string }>;
}) {
  await requireAdminPage();
  const q = await searchParams;
  const topic = q.topic && q.topic in POLL_TOPICS ? (q.topic as PollTopic) : null;
  const [all, suggestions] = await Promise.all([adminListPolls(), adminListPollSuggestions()]);
  const waiting = suggestions.filter((x) => x.status === 'WAITING');
  const polls = topic ? all.filter((p) => p.topic === topic) : all;
  const editing = q.edit ? all.find((p) => p.id === q.edit && p.status === 'upcoming') : null;

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
              kind: editing.kind,
              topic: editing.topic,
              question: editing.question,
              details: editing.details,
              choices: editing.choices.map((c) => c.label),
              maxPicks: editing.maxPicks,
              scale: editing.scale,
              opensAt: editing.opensAt,
              closesAt: editing.closesAt,
            }}
          />
        </>
      ) : q.new ? (
        <>
          <h2>New poll</h2>
          <PollForm
            draft={
              q.q
                ? {
                    question: q.q.slice(0, 200),
                    topic: q.t && q.t in POLL_TOPICS ? (q.t as PollTopic) : 'other',
                  }
                : undefined
            }
          />
        </>
      ) : (
        <p>
          <a href="/admin/polls?new=1" style={{ ...ui.button, textDecoration: 'none' }}>
            Write a new poll
          </a>
        </p>
      )}

      {/* D133: questions people suggested in the app. */}
      <h2>Suggested questions ({waiting.length})</h2>
      {waiting.length === 0 ? <p style={ui.muted}>None waiting.</p> : null}
      <div style={{ display: 'grid', gap: 12 }}>
        {waiting.map((x) => (
          <div key={x.id} style={ui.card}>
            <p style={{ marginTop: 0, ...ui.muted, fontSize: 14 }}>
              {POLL_TOPICS[x.topic]} ·{' '}
              {x.by ? <a href={`/admin/users/${x.by.id}`}>@{x.by.username}</a> : 'Deleted account'}{' '}
              · {when(x.createdAt)}
            </p>
            <h3 style={{ margin: '0 0 6px' }}>{x.question}</h3>
            {x.details ? <p style={ui.muted}>{x.details}</p> : null}
            <PollSuggestionActions id={x.id} question={x.question} topic={x.topic} />
          </div>
        ))}
      </div>

      <nav style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '20px 0 0' }}>
        <a href="/admin/polls" style={{ fontWeight: topic ? 400 : 800 }}>
          All topics
        </a>
        {(Object.keys(POLL_TOPICS) as PollTopic[]).map((t) => (
          <a
            key={t}
            href={`/admin/polls?topic=${t}`}
            style={{ fontWeight: t === topic ? 800 : 400 }}
          >
            {POLL_TOPICS[t]}
          </a>
        ))}
      </nav>
      <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        {polls.length === 0 ? <p style={ui.muted}>No polls yet.</p> : null}
        {polls.map((p) => (
          <div key={p.id} style={ui.card}>
            <p style={{ marginTop: 0, ...ui.muted, fontSize: 14 }}>
              <strong>{STATUS[p.status]}</strong> · {POLL_KINDS[p.kind].label} ·{' '}
              {POLL_TOPICS[p.topic]} · {when(p.opensAt)} → {when(p.closesAt)}
              {p.createdBy ? ` · by @${p.createdBy}` : ''}
            </p>
            <h3 style={{ margin: '4px 0 8px' }}>{p.question}</h3>
            {p.details ? <p style={ui.muted}>{p.details}</p> : null}
            {p.kind === 'multi' ? (
              <p style={{ ...ui.muted, fontSize: 13 }}>
                Pick several{p.maxPicks ? ` (up to ${p.maxPicks})` : ' (all that apply)'}: shares
                are of voters, so they can add up to more than 100%.
              </p>
            ) : null}
            {p.scale ? (
              <p style={{ ...ui.muted, fontSize: 13 }}>
                1 = {p.scale.low} … 5 = {p.scale.high}
              </p>
            ) : null}
            {p.results ? (
              <>
                <Table
                  head={[
                    '',
                    'Voters',
                    ...(p.kind === 'scale' ? ['Average'] : []),
                    ...p.choices.map((c) => c.label),
                  ]}
                >
                  <CountsRow
                    label="All of Duval"
                    c={p.results}
                    choices={p.choices}
                    rated={p.kind === 'scale'}
                  />
                  {p.results.areas.map((a) => (
                    <CountsRow
                      key={a.zip}
                      label={`ZIP ${a.zip}`}
                      c={a}
                      choices={p.choices}
                      rated={p.kind === 'scale'}
                    />
                  ))}
                  {p.results.otherAreas ? (
                    <CountsRow
                      label="Other areas"
                      c={p.results.otherAreas}
                      choices={p.choices}
                      rated={p.kind === 'scale'}
                    />
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
                    {p.votesSoFar} {p.votesSoFar === 1 ? 'person has' : 'people have'} voted so far.
                    Totals appear when it closes.
                  </p>
                ) : null}
              </>
            )}
            <PollActions id={p.id} status={p.status} featured={p.featured} />
          </div>
        ))}
      </div>
    </>
  );
}
