import { COLORS } from '@jax/shared';
import { caseParam } from '@/server/admin/params';
import { getCase } from '@/server/admin/queue';
import { ui } from '../../../../admin-ui';
import { CaseDecision } from '../../../../forms';
import { requireAdminPage } from '../../../../require-admin-page';
import { Pill, Table, td, when, words } from '../../../admin-table';

export const dynamic = 'force-dynamic';

const quote = {
  ...ui.muted,
  borderLeft: `3px solid ${COLORS.cardBorder}`,
  paddingLeft: 10,
};

/** P5.14: one reported item: the content, its context, the reports, the author's record. */
export default async function CasePage(ctx: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  await requireAdminPage();
  const all = (await ctx.searchParams).all === '1';
  const c = await getCase(await caseParam(ctx), { allReports: all });
  const author = c.author && 'username' in c.author ? c.author : null;
  const ok = c.contentStatus === 'VISIBLE' || c.contentStatus === 'ACCOUNT';
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <a href="/admin/reports">← Back to reports</a>
      <div style={ui.card}>
        <div style={{ marginBottom: 8 }}>
          <Pill tone={ok ? 'ok' : 'alert'}>{words(String(c.contentStatus))}</Pill>
          {author ? (
            <>
              by <a href={`/admin/users/${author.id}`}>@{author.username}</a> (
              {words(author.status)})
            </>
          ) : c.author ? (
            'by a GUEST'
          ) : null}
        </div>
        {c.context.place ? <p style={ui.muted}>In {c.context.place}’s discussion</p> : null}
        {c.context.post ? <p style={quote}>On post: {c.context.post}</p> : null}
        {c.context.parent ? <p style={quote}>Replying to: {c.context.parent}</p> : null}
        {c.voiceUrl ? (
          <audio controls src={c.voiceUrl} style={{ display: 'block', margin: '8px 0' }} />
        ) : null}
        {c.messageContext ? (
          // D97: the conversation around the reported message (snapshot at report time).
          <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
            <p style={ui.muted}>Private message, with the messages around it:</p>
            {c.messageContext.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: m.reported
                    ? `2px solid ${COLORS.error}`
                    : `1px solid ${COLORS.cardBorder}`,
                }}
              >
                <strong>@{m.sender}</strong> · {when(m.createdAt)}
                {m.reported ? ' · REPORTED' : ''}
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {m.body || ''}
                  {m.photoIds.length
                    ? ` [${m.photoIds.length} photo${m.photoIds.length === 1 ? '' : 's'}]`
                    : ''}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {c.photoUrl ? (
          <img src={c.photoUrl} alt="Reported photo" style={{ maxWidth: '100%', maxHeight: 480 }} />
        ) : (
          <p style={{ fontSize: 18, whiteSpace: 'pre-wrap' }}>{c.body}</p>
        )}
      </div>

      <CaseDecision
        type={c.type}
        id={c.id}
        held={c.contentStatus === 'HELD_FOR_REVIEW'}
        removed={c.contentStatus === 'REMOVED'}
        isProfile={c.type === 'user'}
        hasAuthor={!!author}
      />

      <h2 style={{ marginBottom: 0 }}>Reports ({c.reportTotal})</h2>
      {/* D74: a summary instead of a flood; the list shows the newest 20 unless asked. */}
      <p style={{ ...ui.muted, margin: 0 }}>
        {c.reportsByReason.map((g) => `${words(g.reason)} ${g.count}`).join(' · ')}
        {c.reportTotal > c.reports.length ? (
          <>
            {' · '}showing the newest {c.reports.length}.{' '}
            <a href="?all=1">Show all {c.reportTotal}</a>
          </>
        ) : null}
      </p>
      <Table head={['Reason', 'Details', 'From', 'When', 'Status']}>
        {c.reports.map((r) => (
          <tr key={r.id}>
            <td style={td}>{words(r.reason)}</td>
            <td style={{ ...td, maxWidth: 360 }}>{r.details ?? ''}</td>
            <td style={td}>{r.reporter}</td>
            <td style={td}>{when(r.createdAt)}</td>
            <td style={td}>
              {words(r.status)}
              {r.resolvedBy ? ` by @${r.resolvedBy}` : ''}
            </td>
          </tr>
        ))}
      </Table>

      {c.accountReports?.length ? (
        <>
          <h2 style={{ marginBottom: 0 }}>Reports on this account’s posts and comments</h2>
          <Table head={['Reason', 'Details', 'From', 'On', 'When', 'Status']}>
            {c.accountReports.map((r) => (
              <tr key={r.id}>
                <td style={td}>{words(r.reason)}</td>
                <td style={{ ...td, maxWidth: 280 }}>{r.details ?? ''}</td>
                <td style={td}>{r.reporter}</td>
                <td style={{ ...td, maxWidth: 280 }}>
                  <a href={`/admin/cases/${r.on.type}/${r.on.id}`}>{r.on.preview}</a>
                </td>
                <td style={td}>{when(r.createdAt)}</td>
                <td style={td}>{words(r.status)}</td>
              </tr>
            ))}
          </Table>
        </>
      ) : null}

      {c.authorHistory ? (
        <>
          <h2 style={{ marginBottom: 0 }}>Author history</h2>
          <p style={ui.muted}>
            {c.authorHistory.reportsAgainst} reports against · {c.authorHistory.contentRemoved}{' '}
            items removed · {c.authorHistory.locationFlags} location flags
          </p>
          {c.authorHistory.actions.length ? (
            <Table head={['Action', 'Reason', 'Internal note', 'By', 'When']}>
              {c.authorHistory.actions.map((a) => (
                <tr key={a.id} style={a.voidedAt ? { opacity: 0.5 } : undefined}>
                  <td style={td}>
                    {words(a.action)}
                    {a.voidedAt ? ' (cancelled)' : ''}
                  </td>
                  <td style={td}>{a.reason}</td>
                  <td style={td}>{a.internalNote ?? ''}</td>
                  <td style={td}>@{a.by}</td>
                  <td style={td}>{when(a.createdAt)}</td>
                </tr>
              ))}
            </Table>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
