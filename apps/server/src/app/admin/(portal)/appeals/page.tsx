import { COLORS } from '@jax/shared';
import { listAppeals } from '@/server/admin/users';
import { ui } from '../../admin-ui';
import { AppealDecision } from '../../forms';
import { requireAdminPage } from '../../require-admin-page';
import { Pill, when, words } from '../admin-table';

export const dynamic = 'force-dynamic';

/** P5.7 / P5.14: appeals waiting for a decision. */
export default async function AppealsPage() {
  await requireAdminPage();
  const appeals = await listAppeals('OPEN');
  return (
    <>
      <h1>Appeals</h1>
      {appeals.length === 0 ? <p style={ui.muted}>No appeals waiting.</p> : null}
      <div style={{ display: 'grid', gap: 16 }}>
        {appeals.map((a) => (
          <div key={a.id} style={ui.card}>
            <p style={{ marginTop: 0 }}>
              <a href={`/admin/users/${a.user.id}`}>@{a.user.username}</a>{' '}
              <Pill tone={a.user.status === 'ACTIVE' ? 'muted' : 'alert'}>
                {words(a.user.status)}
              </Pill>
              appealed a <strong>{words(a.strike.action)}</strong> from {when(a.strike.createdAt)} ·
              sent {when(a.createdAt)}
            </p>
            <p style={ui.muted}>
              Reason given: {a.strike.reason}
              {a.strike.internalNote ? ` · Note: ${a.strike.internalNote}` : ''}
            </p>
            <blockquote
              style={{
                margin: 0,
                paddingLeft: 12,
                borderLeft: `3px solid ${COLORS.cardBorder}`,
                whiteSpace: 'pre-wrap',
              }}
            >
              {a.message}
            </blockquote>
            <AppealDecision appealId={a.id} />
          </div>
        ))}
      </div>
    </>
  );
}
