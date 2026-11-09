import { TOPIC_CATEGORIES } from '@jax/shared';
import { adminListTopics, topicApprovalRequired } from '@/server/topics';
import { ui } from '../../admin-ui';
import { requireAdminPage } from '../../require-admin-page';
import {
  SuggestionActions,
  TopicApprovalSwitch,
  TopicForm,
  TopicStatusButton,
} from '../../topic-forms';
import { Pager, when } from '../admin-table';
import { pageNumber } from '@/server/admin/paging';

export const dynamic = 'force-dynamic';

/**
 * D125: citywide topics. Suggestions from users wait at the top (approve, optionally with a
 * better title, or reject with a reason they'll see). Create topics, pin them, schedule a
 * start and end, close or reopen them.
 */
export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{
    edit?: string;
    new?: string;
    page?: string;
    wpage?: string;
    hpage?: string;
    dpage?: string;
    rpage?: string;
  }>;
}) {
  await requireAdminPage();
  const q = await searchParams;
  const approval = await topicApprovalRequired();
  // D210: each section is paged on its own (page, wpage, hpage, dpage, rpage).
  const editId = q.edit && /^[0-9a-f-]{36}$/i.test(q.edit) ? q.edit : undefined;
  const [waitingPage, topicsPage, rejectedPage, heldPage, deletedPage, edited] = await Promise.all([
    adminListTopics({ statuses: ['SUGGESTED'], page: pageNumber(q.wpage) }),
    adminListTopics({ statuses: ['ACTIVE', 'CLOSED', 'REMOVED'], page: pageNumber(q.page) }),
    adminListTopics({ statuses: ['REJECTED'], page: pageNumber(q.rpage) }),
    // D134: hidden after many reports, and deleted by their creators (kept a week).
    adminListTopics({ statuses: ['HELD'], page: pageNumber(q.hpage) }),
    adminListTopics({ statuses: ['DELETED'], page: pageNumber(q.dpage) }),
    editId ? adminListTopics({ statuses: ['ACTIVE', 'CLOSED', 'REMOVED'], id: editId }) : null,
  ]);
  const waiting = waitingPage.rows;
  const topics = topicsPage.rows;
  const rejected = rejectedPage.rows;
  const held = heldPage.rows;
  const deleted = deletedPage.rows;
  const editing = edited?.rows[0] ?? null;
  const params = { page: q.page, wpage: q.wpage, hpage: q.hpage, dpage: q.dpage, rpage: q.rpage };
  const pager = (page: typeof waitingPage, param: string) => (
    <Pager page={page} base="/admin/topics" params={params} param={param} />
  );

  return (
    <>
      <h1>Citywide topics</h1>
      <p style={ui.muted}>
        Discussions for all of Duval, shown at the top of Home. Anyone inside the county can post;
        the usual rules and reports apply.
      </p>

      <div style={{ ...ui.card, marginBottom: 12 }}>
        <p style={{ margin: '0 0 8px' }}>
          <strong>
            {approval
              ? 'Topics people start need your approval.'
              : 'Topics people start appear at once.'}
          </strong>{' '}
          {approval
            ? 'They wait under “Suggestions waiting” until you approve or reject them.'
            : 'Anyone old enough to start topics can post one right away; reports and the usual rules still apply.'}{' '}
          The waiting time between topics and the account age rule apply either way, and staff are
          never held.
        </p>
        <TopicApprovalSwitch required={approval} />
      </div>

      {editing ? (
        <>
          <h2>Edit topic</h2>
          <TopicForm topic={editing} />
        </>
      ) : q.new ? (
        <>
          <h2>New topic</h2>
          <TopicForm />
        </>
      ) : (
        <p>
          <a href="/admin/topics?new=1" style={{ ...ui.button, textDecoration: 'none' }}>
            Create a topic
          </a>
        </p>
      )}

      <h2>Waiting for approval ({waitingPage.total})</h2>
      {waitingPage.total === 0 ? <p style={ui.muted}>None right now.</p> : null}
      <div style={{ display: 'grid', gap: 12 }}>
        {waiting.map((t) => (
          <div key={t.id} style={ui.card}>
            <p style={{ marginTop: 0, ...ui.muted, fontSize: 14 }}>
              {t.suggestedBy ? (
                <a href={`/admin/users/${t.suggestedBy.id}`}>@{t.suggestedBy.username}</a>
              ) : (
                'Deleted account'
              )}{' '}
              · {when(t.createdAt)}
            </p>
            <h3 style={{ margin: '0 0 6px' }}>{t.title}</h3>
            {t.description ? <p style={ui.muted}>{t.description}</p> : null}
            <SuggestionActions id={t.id} title={t.title} category={t.category} />
          </div>
        ))}
      </div>
      {pager(waitingPage, 'wpage')}

      {heldPage.total ? (
        <>
          <h2>Held for review ({heldPage.total})</h2>
          <p style={ui.muted}>
            Hidden automatically after 15 or more people reported them. Decide them in{' '}
            <a href="/admin/reports">Reports</a> (Approve brings one back, Remove takes it down).
          </p>
          <ul>
            {held.map((t) => (
              <li key={t.id}>
                <a href={`/admin/cases/topic/${t.id}`}>{t.title}</a>
                {t.createdBy ? ` · by @${t.createdBy}` : ''}
              </li>
            ))}
          </ul>
          {pager(heldPage, 'hpage')}
        </>
      ) : null}
      {deletedPage.total ? (
        <>
          <h2>Deleted by their creators ({deletedPage.total})</h2>
          <p style={ui.muted}>
            Hidden from everyone; kept here for a week after deletion, then removed with their
            posts.
          </p>
          <ul>
            {deleted.map((t) => (
              <li key={t.id}>
                <strong>{t.title}</strong>
                {t.description ? ` · ${t.description}` : ''}
                {t.createdBy ? ` · by @${t.createdBy}` : ''} · {t.posts}{' '}
                {t.posts === 1 ? 'post' : 'posts'}
                {t.deletedAt ? ` · deleted ${when(t.deletedAt)}` : ''}
              </li>
            ))}
          </ul>
          {pager(deletedPage, 'dpage')}
        </>
      ) : null}

      <h2>Topics</h2>
      {topicsPage.total === 0 ? <p style={ui.muted}>No topics yet.</p> : null}
      <div style={{ display: 'grid', gap: 12 }}>
        {topics.map((t) => (
          <div key={t.id} style={ui.card}>
            <p style={{ marginTop: 0, ...ui.muted, fontSize: 14 }}>
              <strong>{t.status === 'REMOVED' ? 'Removed' : t.open ? 'Open' : 'Closed'}</strong> ·{' '}
              {t.scope === 'local' ? 'Near me (local)' : 'City'} · {TOPIC_CATEGORIES[t.category]}
              {t.createdBy ? ` · by @${t.createdBy}` : ''}
              {t.pinned ? ' · Pinned' : ''} · starts {when(t.opensAt)}
              {t.closesAt ? ` · ends ${when(t.closesAt)}` : ''} · {t.posts}{' '}
              {t.posts === 1 ? 'post' : 'posts'}
              {t.suggestedBy ? ` · suggested by @${t.suggestedBy.username}` : ''}
            </p>
            <h3 style={{ margin: '0 0 6px' }}>{t.title}</h3>
            {t.description ? <p style={ui.muted}>{t.description}</p> : null}
            <TopicStatusButton id={t.id} open={t.open} />
          </div>
        ))}
      </div>
      {pager(topicsPage, 'page')}

      {rejectedPage.total ? (
        <>
          <h2>Recently rejected</h2>
          <ul>
            {rejected.map((t) => (
              <li key={t.id}>
                {t.title} · <span style={ui.muted}>{t.decisionReason}</span>
              </li>
            ))}
          </ul>
          {pager(rejectedPage, 'rpage')}
        </>
      ) : null}
    </>
  );
}
