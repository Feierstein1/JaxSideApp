import { uuidParam } from '@/server/admin/params';
import { getUserRecord } from '@/server/admin/users';
import { ui } from '../../../admin-ui';
import { UserActions, VoidStrike } from '../../../forms';
import { requireAdminPage } from '../../../require-admin-page';
import { Pill, Table, td, when, words } from '../../admin-table';

export const dynamic = 'force-dynamic';

const STRIKES = new Set(['WARN', 'SUSPEND', 'BAN']);

/** P5.14: a person's record and enforcement actions. Never their email. */
export default async function UserPage(ctx: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const u = await getUserRecord(await uuidParam(ctx));
  const content = [
    ...u.recentPosts.map((p) => ({ ...p, kind: 'Post' })),
    ...u.recentComments.map((c) => ({ ...c, kind: 'Comment' })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <a href="/admin/users">← Users</a>
      <div style={ui.card}>
        <h1 style={{ margin: 0 }}>@{u.username}</h1>
        <p>
          <Pill tone={u.status === 'ACTIVE' ? 'ok' : 'alert'}>{words(u.status)}</Pill>
          {u.suspendedUntil ? `until ${when(u.suspendedUntil)} · ` : ''}
          {u.role === 'ADMIN' ? <Pill>admin</Pill> : null}
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

      {u.role !== 'ADMIN' ? <UserActions userId={u.id} status={u.status} /> : null}

      <h2 style={{ marginBottom: 0 }}>Moderation history</h2>
      {u.history.actions.length === 0 ? (
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
