import { adminChatRooms } from '@/server/admin/chat';
import { pageNumber } from '@/server/admin/paging';
import { ui } from '../../admin-ui';
import { ChatRoomControls } from '../../forms';
import { requireAdminPage } from '../../require-admin-page';
import { Pager, Pill, Table, td, when } from '../admin-table';

export const dynamic = 'force-dynamic';

/**
 * D218: live area chat rooms. A room appears here the first time a confirmed account opens the
 * feed in that map cell (about a mile square). Every room starts off: switch on the areas you
 * want to try. A room only opens for people once at least 2 are about (seen in the last 10
 * minutes).
 */
export default async function ChatRoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPage();
  const list = await adminChatRooms(pageNumber((await searchParams).page));
  return (
    <>
      <h1>Area chat</h1>
      <p style={ui.muted}>
        Text-only chat for a map cell about a mile across. Lines are kept at most 23 hours and a
        room keeps only its newest lines. Open a room to read it and see who wrote what.
      </p>
      {list.total === 0 ? (
        <p style={ui.muted}>
          No rooms yet. One is created when a confirmed account opens the feed in a new cell.
        </p>
      ) : (
        <Table head={['Room', 'ZIP', 'Here now', 'Lines', 'Last line', 'Status', '']}>
          {list.rows.map((r) => (
            <tr key={r.id}>
              <td style={td}>
                <a href={`/admin/chat/${r.id}`}>{r.title}</a>
                <div style={{ ...ui.muted, fontSize: 12 }}>cell {r.cellKey}</div>
              </td>
              <td style={td}>{r.zip ?? '—'}</td>
              <td style={td}>{r.present}</td>
              <td style={td}>{r.lines}</td>
              <td style={td}>{r.lines ? when(r.lastActivityAt.toISOString()) : '—'}</td>
              <td style={td}>
                {r.enabled ? <Pill tone="ok">on</Pill> : <Pill tone="alert">off</Pill>}
              </td>
              <td style={td}>
                <ChatRoomControls roomId={r.id} enabled={r.enabled} name={r.displayName ?? ''} />
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={list} base="/admin/chat" params={{}} />
    </>
  );
}
