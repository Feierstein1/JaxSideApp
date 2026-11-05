import { COLORS } from '@jax/shared';
import { uuidParam } from '@/server/admin/params';
import { getUserRecord } from '@/server/admin/users';
import { ui } from '../../../admin-ui';
import { NotifyForReport, StaffBadge, UserActions, VoidStrike } from '../../../forms';
import { requireAdminPage } from '../../../require-admin-page';
import { Pager, Pill, Table, td, when, words } from '../../admin-table';
import { pageNumber, toPage } from '@/server/admin/paging';

export const dynamic = 'force-dynamic';

const STRIKES = new Set(['WARN', 'SUSPEND', 'BAN']);

const WHAT: Record<string, string> = {
  user: 'profile',
  general: 'post',
  business: 'place post',
  comment: 'comment',
  photo: 'photo',
  message: 'message',
  topic: 'topic',
};

/** The ladder step a strike gives now, for the Notify button. */
function stepLabel(next: { action: string; hours?: number } | null) {
  if (!next) return null;
  if (next.action === 'WARN') return 'warning';
  if (next.action === 'BAN') return 'ban';
  return next.hours! % 24 === 0
    ? `${next.hours! / 24} day suspension`
    : `${next.hours} h suspension`;
}

/** P5.14: a person's record and enforcement actions. Never their email. */
export default async function UserPage(ctx: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rpage?: string; hpage?: string }>;
}) {
  await requireAdminPage();
  const sp = await ctx.searchParams;
  const u = await getUserRecord(await uuidParam(ctx), {
    reportsPage: pageNumber(sp.rpage),
    historyPage: pageNumber(sp.hpage),
  });
  // D210: the reports (rpage) and the history (hpage) are paged on their own.
  const base = `/admin/users/${u.id}`;
  const params = { rpage: sp.rpage, hpage: sp.hpage };
  const reportsPage = toPage(u.reports, u.history.reportsAgainst, pageNumber(sp.rpage));
  const content = [
    ...u.recentPosts.map((p) => ({ ...p, kind: 'Post' })),
    ...u.recentComments.map((c) => ({ ...c, kind: 'Comment' })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const step = u.role === 'ADMIN' ? null : stepLabel(u.nextStrike);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <a href="/admin/users">← Users</a>
      <div style={{ ...ui.card, display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {u.avatarUrl ? (
          <img
            src={u.avatarUrl}
            alt={`@${u.username}'s profile photo`}
            style={{ width: 120, height: 120, borderRadius: 60, objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <div
            aria-label="No profile photo"
            style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 48,
              fontWeight: 700,
              background: COLORS.surfaceInverse,
              color: COLORS.onSurfaceInverse,
            }}
          >
            {u.username.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0 }}>@{u.username}</h1>
          <p>
            <Pill tone={u.status === 'ACTIVE' ? 'ok' : 'alert'}>{words(u.status)}</Pill>
            {u.suspendedUntil ? `until ${when(u.suspendedUntil)} · ` : ''}
            {u.role === 'ADMIN' ? <Pill>admin</Pill> : null}
            {u.staffBadge ? <Pill>ADMIN badge</Pill> : null}
            {u.legalHold ? <Pill tone="alert">legal hold</Pill> : null}
            joined {when(u.joinedAt)} · email {u.emailVerified ? 'confirmed' : 'not confirmed'}
          </p>
          {u.bio ? <p>{u.bio}</p> : null}
          {u.previousUsernames.length ? (
            <p style={ui.muted}>
              Previously: {u.previousUsernames.map((h) => `@${h.username}`).join(', ')}
            </p>
          ) : null}
          <p style={ui.muted}>
            {u.history.reportsAgainst} reports against · {u.history.contentRemoved} items removed ·{' '}
            {u.history.locationFlags} location flags
          </p>
        </div>
      </div>

      {u.role !== 'ADMIN' ? <UserActions userId={u.id} status={u.status} /> : null}
      <StaffBadge userId={u.id} on={u.staffBadge} />

      <h2 style={{ marginBottom: 0 }}>Reports about them</h2>
      {u.history.reportsAgainst === 0 ? (
        <p style={ui.muted}>None.</p>
      ) : (
        <>
          <Table head={['Reason', 'Details', 'About', 'Reported by', 'Status', 'When', '']}>
            {u.reports.map((r) => (
              <tr key={r.id}>
                <td style={td}>{words(r.reason)}</td>
                <td style={{ ...td, maxWidth: 320 }}>{r.details ?? ''}</td>
                <td style={td}>
                  {r.caseHref && r.what ? <a href={r.caseHref}>{WHAT[r.what]}</a> : ''}
                </td>
                <td style={td}>{r.reporter}</td>
                <td style={td}>
                  <Pill tone={r.status === 'OPEN' ? 'alert' : 'muted'}>{words(r.status)}</Pill>
                </td>
                <td style={td}>{when(r.createdAt)}</td>
                <td style={td}>
                  {r.strike ? (
                    <span style={ui.muted}>
                      Notified ({words(r.strike.action)}) {when(r.strike.createdAt)}
                    </span>
                  ) : step ? (
                    <NotifyForReport
                      userId={u.id}
                      reportId={r.id}
                      step={step}
                      suggested={`You were reported for ${words(r.reason)}${r.what && r.what !== 'user' ? ` (your ${WHAT[r.what]})` : ''}. Please follow the Community Guidelines.`}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
          <Pager page={reportsPage} base={base} params={params} param="rpage" />
        </>
      )}

      <h2 style={{ marginBottom: 0 }}>Moderation history</h2>
      {u.history.actionsPage.total === 0 ? (
        <p style={ui.muted}>Nothing on record.</p>
      ) : (
        <Table head={['Action', 'Reason', 'Internal note', 'By', 'When', '']}>
          {u.history.actions.map((a) => (
            <tr key={a.id} style={a.voidedAt ? { opacity: 0.5 } : undefined}>
              <td style={td}>
                {words(a.action)}
                {a.voidedAt ? ` (cancelled: ${a.voidReason ?? ''})` : ''}
              </td>
              <td style={td}>{a.reason}</td>
              <td style={td}>{a.internalNote ?? ''}</td>
              <td style={td}>@{a.by}</td>
              <td style={td}>{when(a.createdAt)}</td>
              <td style={td}>
                {STRIKES.has(a.action) && !a.voidedAt ? (
                  <VoidStrike userId={u.id} strikeId={a.id} />
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {u.history.actionsPage.total ? (
        <Pager page={u.history.actionsPage} base={base} params={params} param="hpage" />
      ) : null}

      <h2 style={{ marginBottom: 0 }}>Recent posts and comments</h2>
      {content.length === 0 ? (
        <p style={ui.muted}>None.</p>
      ) : (
        <Table head={['Type', 'Text', 'Status', 'When']}>
          {content.map((x) => (
            <tr key={x.id}>
              <td style={td}>{x.kind}</td>
              <td style={{ ...td, maxWidth: 480 }}>{x.body || '[blank]'}</td>
              <td style={td}>{words(x.status)}</td>
              <td style={td}>{when(x.createdAt)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
