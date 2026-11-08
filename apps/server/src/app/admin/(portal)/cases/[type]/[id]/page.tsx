import { COLORS } from '@jax/shared';
import { caseParam } from '@/server/admin/params';
import { getCase } from '@/server/admin/queue';
import { ui } from '../../../../admin-ui';
import { CaseDecision } from '../../../../forms';
import { requireAdminPage } from '../../../../require-admin-page';
import { Pager, Pill, Table, td, when, words } from '../../../admin-table';
import { pageNumber } from '@/server/admin/paging';

export const dynamic = 'force-dynamic';

const quote = {
  ...ui.muted,
  borderLeft: `3px solid ${COLORS.cardBorder}`,
  paddingLeft: 10,
};

/** P5.14: one reported item: the content, its context, the reports, the author's record. */
export default async function CasePage(ctx: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<{ page?: string; apage?: string; hpage?: string }>;
}) {
  await requireAdminPage();
  const sp = await ctx.searchParams;
  const ref = await caseParam(ctx);
  const c = await getCase(ref, {
    reportsPage: pageNumber(sp.page),
    accountReportsPage: pageNumber(sp.apage),
    historyPage: pageNumber(sp.hpage),
  });
  // D210: each list on the page has its own page number.
  const base = `/admin/cases/${ref.type}/${ref.id}`;
  const params = { page: sp.page, apage: sp.apage, hpage: sp.hpage };
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
          ) : c.author && 'business' in c.author ? (
            // D172: from the business website; the login is the employee who wrote it.
            <>
              by the business (login:{' '}
              <a href={`/admin/businesses/${c.author.accountId}`}>{c.author.signInName}</a>)
            </>
          ) : c.author ? (
            'by a GUEST'
          ) : null}
        </div>
        {c.context.place ? <p style={ui.muted}>In {c.context.place}’s discussion</p> : null}
        {c.context.post ? <p style={quote}>On post: {c.context.post}</p> : null}
        {c.context.parent ? <p style={quote}>Replying to: {c.context.parent}</p> : null}
        {c.videoUrl ? (
          <video
            controls
            src={c.videoUrl}
            style={{ display: 'block', maxWidth: '100%', maxHeight: 480 }}
          />
        ) : null}
        {c.voiceUrl ? (
          <audio controls src={c.voiceUrl} style={{ display: 'block', margin: '8px 0' }} />
        ) : null}
        {c.chatContext ? (
          // D218: copied from area chat when reported (the chat itself is deleted after 24 hours).
          <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
            <p style={ui.muted}>
              Area chat in {c.chatContext.room}: their last {c.chatContext.lines.length} lines when
              reported.
            </p>
            {c.chatContext.lines.map((l) => (
              <div
                key={l.at + l.body}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: `1px solid ${COLORS.cardBorder}`,
                }}
              >
                <span style={ui.muted}>{when(l.at)}</span>
                <div style={{ whiteSpace: 'pre-wrap' }}>{l.body}</div>
              </div>
            ))}
          </div>
        ) : null}
        {c.messageContext ? (
          // D98: the conversation around the reported message (snapshot at report time).
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
      {/* D74: a summary instead of a flood; the list below is newest first, 20 a page. */}
      <p style={{ ...ui.muted, margin: 0 }}>
        {c.reportsByReason.map((g) => `${words(g.reason)} ${g.count}`).join(' · ')}
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
      <Pager page={c.reportsPage} base={base} params={params} />

      {c.accountReports && c.accountReportsPage?.total ? (
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
          {c.accountReportsPage ? (
            <Pager page={c.accountReportsPage} base={base} params={params} param="apage" />
          ) : null}
        </>
      ) : null}

      {c.authorHistory ? (
        <>
          <h2 style={{ marginBottom: 0 }}>Author history</h2>
          <p style={ui.muted}>
            {c.authorHistory.reportsAgainst} reports against · {c.authorHistory.contentRemoved}{' '}
            items removed · {c.authorHistory.locationFlags} location flags
          </p>
          {c.authorHistory.actionsPage.total ? (
            <>
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
              <Pager page={c.authorHistory.actionsPage} base={base} params={params} param="hpage" />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
