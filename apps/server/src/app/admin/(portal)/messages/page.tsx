import { pageNumber } from '@/server/admin/paging';
import { listContactMessages } from '@/server/contact';
import { ui } from '../../admin-ui';
import { ContactActions } from '../../forms';
import { requireAdminPage } from '../../require-admin-page';
import { Pager, Pill, when } from '../admin-table';

export const dynamic = 'force-dynamic';

const CATEGORY = { SUPPORT: 'Support ticket', GENERAL: 'General' } as const;
/** D251: Open, waiting on the sender ("Need more details"), or answered. */
const STATUS = { OPEN: 'Open', NEEDS_INFO: 'Needs details', RESOLVED: 'Resolved' } as const;
const ANSWERED = { NEEDS_INFO: 'asked for details', RESOLVED: 'resolved' } as const;

/** D90: Contact us messages, oldest open first. Filter by status and category (D251: three). */
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; page?: string }>;
}) {
  await requireAdminPage();
  const q = await searchParams;
  const status =
    q.status === 'RESOLVED' || q.status === 'NEEDS_INFO' ? q.status : ('OPEN' as const);
  const category = q.category === 'SUPPORT' || q.category === 'GENERAL' ? q.category : undefined;
  const list = await listContactMessages({ status, category, page: pageNumber(q.page) });
  const messages = list.rows;
  const link = (s: string, c?: string) => `/admin/messages?status=${s}${c ? `&category=${c}` : ''}`;
  return (
    <>
      <h1>Messages</h1>
      <nav style={{ display: 'flex', gap: 14, marginBottom: 8 }}>
        {(['OPEN', 'NEEDS_INFO', 'RESOLVED'] as const).map((s) => (
          <a key={s} href={link(s, category)} style={{ fontWeight: s === status ? 800 : 400 }}>
            {STATUS[s]}
          </a>
        ))}
        <span style={ui.muted}>|</span>
        <a href={link(status)} style={{ fontWeight: !category ? 800 : 400 }}>
          All
        </a>
        {(['SUPPORT', 'GENERAL'] as const).map((c) => (
          <a key={c} href={link(status, c)} style={{ fontWeight: c === category ? 800 : 400 }}>
            {CATEGORY[c]}
          </a>
        ))}
      </nav>
      {list.total === 0 ? <p style={ui.muted}>Nothing here.</p> : null}
      <div style={{ display: 'grid', gap: 16 }}>
        {messages.map((m) => (
          <div key={m.id} style={ui.card}>
            <p style={{ marginTop: 0 }}>
              <Pill tone={m.category === 'SUPPORT' ? 'alert' : 'muted'}>
                {CATEGORY[m.category]}
              </Pill>{' '}
              <strong>{m.subject}</strong>
            </p>
            <p style={ui.muted}>
              From{' '}
              {typeof m.from === 'string' ? (
                m.from
              ) : 'business' in m.from ? (
                // D213: a ticket from the owner website.
                <a href={`/admin/businesses/${m.from.accountId}`}>
                  Business: {m.from.place ?? 'no place now'} ({m.from.login})
                </a>
              ) : (
                <a href={`/admin/users/${m.from.id}`}>@{m.from.username}</a>
              )}{' '}
              · {when(m.createdAt.toISOString())}
              {m.resolvedAt && m.status !== 'OPEN'
                ? ` · ${ANSWERED[m.status]} ${when(m.resolvedAt.toISOString())}${m.resolvedBy ? ` by @${m.resolvedBy}` : ''}`
                : ''}
            </p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{m.body}</p>
            {m.adminNote && m.status !== 'OPEN' ? (
              <p style={{ ...ui.muted, whiteSpace: 'pre-wrap' }}>
                <strong>Our note:</strong> {m.adminNote}
              </p>
            ) : null}
            <ContactActions
              id={m.id}
              status={m.status}
              canReply={m.canReply}
              business={typeof m.from !== 'string' && 'business' in m.from}
            />
          </div>
        ))}
      </div>
      <Pager page={list} base="/admin/messages" params={{ status, category }} />
    </>
  );
}
