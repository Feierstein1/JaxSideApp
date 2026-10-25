import { TOPIC_CATEGORIES } from '@jax/shared';
import { adminListTopics } from '@/server/topics';
import { ui } from '../../admin-ui';
import { requireAdminPage } from '../../require-admin-page';
import { SuggestionActions, TopicForm, TopicStatusButton } from '../../topic-forms';
import { when } from '../admin-table';

export const dynamic = 'force-dynamic';

/**
 * D125: citywide topics. Suggestions from users wait at the top (approve, optionally with a
 * better title, or reject with a reason they'll see). Create topics, pin them, schedule a
 * start and end, close or reopen them.
 */
export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string }>;
}) {
  await requireAdminPage();
  const q = await searchParams;
  const all = await adminListTopics();
  const waiting = all.filter((t) => t.status === 'SUGGESTED');
  const topics = all.filter((t) => t.status === 'ACTIVE' || t.status === 'CLOSED');
  const rejected = all.filter((t) => t.status === 'REJECTED').slice(0, 20);
  const editing = q.edit ? topics.find((t) => t.id === q.edit) : null;

  return (
    <>
      <h1>Citywide topics</h1>
      <p style={ui.muted}>
        Discussions for all of Duval, shown at the top of Home. Anyone inside the county can post;
        the usual rules and reports apply.
      </p>

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

      <h2>Suggestions waiting ({waiting.length})</h2>
      {waiting.length === 0 ? <p style={ui.muted}>None right now.</p> : null}
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

      <h2>Topics</h2>
      {topics.length === 0 ? <p style={ui.muted}>No topics yet.</p> : null}
      <div style={{ display: 'grid', gap: 12 }}>
        {topics.map((t) => (
          <div key={t.id} style={ui.card}>
            <p style={{ marginTop: 0, ...ui.muted, fontSize: 14 }}>
              <strong>{t.open ? 'Open' : 'Closed'}</strong> · {TOPIC_CATEGORIES[t.category]}
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

      {rejected.length ? (
        <>
          <h2>Recently rejected</h2>
          <ul>
            {rejected.map((t) => (
              <li key={t.id}>
                {t.title} · <span style={ui.muted}>{t.decisionReason}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
