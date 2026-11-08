import { adminChatRoom } from '@/server/admin/chat';
import { uuidParam } from '@/server/admin/params';
import { COLORS } from '@jax/shared';
import { ui } from '../../../admin-ui';
import { ChatRoomControls, ChatUnmuteButton } from '../../../forms';
import { requireAdminPage } from '../../../require-admin-page';
import { Pill, when } from '../../admin-table';

export const dynamic = 'force-dynamic';

/** D218: one chat room as people see it, oldest line first, with who wrote each line. */
export default async function ChatRoomPage(ctx: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const id = await uuidParam({ params: ctx.params });
  const { room, lines, present, mutedIds } = await adminChatRoom(id);
  return (
    <>
      <p>
        <a href="/admin/chat">← All rooms</a>
      </p>
      <h1>
        {room.title} {room.enabled ? <Pill tone="ok">on</Pill> : <Pill tone="alert">off</Pill>}
      </h1>
      <p style={ui.muted}>
        ZIP {room.zip ?? '—'} · cell {room.cellKey} · {present} here in the last 10 minutes ·{' '}
        {lines.length} lines kept. Lines older than 23 hours are gone.
      </p>
      <p>
        <ChatRoomControls roomId={room.id} enabled={room.enabled} name={room.displayName ?? ''} />
      </p>
      {lines.length === 0 ? (
        <p style={ui.muted}>Nothing has been said here (or it has all expired).</p>
      ) : (
        <div
          style={{
            background: COLORS.background,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 12,
            padding: 14,
          }}
        >
          {lines.map((l) => (
            <div
              key={l.id}
              style={{ padding: '6px 0', borderBottom: `1px solid ${COLORS.hairline}` }}
            >
              <span style={{ ...ui.muted, fontSize: 12 }}>{when(l.createdAt.toISOString())} </span>
              <a href={`/admin/users/${l.author.id}`} style={{ fontWeight: 700 }}>
                @{l.author.username}
              </a>{' '}
              {l.author.role === 'ADMIN' || l.author.staffBadge ? (
                <Pill tone="ok">staff</Pill>
              ) : null}
              {mutedIds.has(l.author.id) ? (
                <>
                  <Pill tone="alert">muted</Pill> <ChatUnmuteButton userId={l.author.id} />
                </>
              ) : null}
              {l.author.status !== 'ACTIVE' ? <Pill tone="alert">{l.author.status}</Pill> : null}
              <div style={{ whiteSpace: 'pre-wrap' }}>{l.body}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
