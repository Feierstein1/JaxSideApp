import { notFound } from 'next/navigation';
import { pageNumber } from '@/server/admin/paging';
import { adminTopicPosts, topicPostTab, TOPIC_POST_TABS } from '@/server/admin/topic-posts';
import { ApiError } from '@/server/http';
import { ui } from '../../../admin-ui';
import { TopicPostActions } from '../../../forms';
import { requireAdminPage } from '../../../require-admin-page';
import { Pager, Pill, Tabs, when } from '../../admin-table';

export const dynamic = 'force-dynamic';

const TAB_LABEL = { visible: 'Visible', held: 'Held for review', removed: 'Removed' } as const;

/**
 * One citywide topic and its posts (20 a page, newest first), with moderation on each post:
 * remove it and/or strike, suspend or ban its author. The full case (reports, the author's
 * record) is one click away.
 */
export default async function TopicPostsPage(ctx: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  await requireAdminPage();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await ctx.searchParams;
  const tab = topicPostTab(sp.tab);
  const data = await adminTopicPosts(id, tab, pageNumber(sp.page)).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const { topic, counts, posts } = data;
  const base = `/admin/topics/${id}`;
  return (
    <>
      <p>
        <a href="/admin/topics">← Back to topics</a>
      </p>
      <h1 style={{ marginBottom: 4 }}>{topic.title}</h1>
      <p style={ui.muted}>
        <Pill tone={topic.status === 'ACTIVE' ? 'ok' : 'muted'}>{topic.status.toLowerCase()}</Pill>{' '}
        Started {when(topic.createdAt)}
      </p>
      {topic.description ? <p style={ui.muted}>{topic.description}</p> : null}

      <Tabs
        items={TOPIC_POST_TABS.map((t) => ({
          href: `${base}?tab=${t}`,
          label: `${TAB_LABEL[t]} (${counts[t]})`,
          on: t === tab,
        }))}
      />

      {posts.total === 0 ? <p style={ui.muted}>No posts here.</p> : null}
      <div style={{ display: 'grid', gap: 12 }}>
        {posts.rows.map((p) => (
          <div key={p.id} style={ui.card}>
            <p style={{ marginTop: 0, ...ui.muted, fontSize: 14 }}>
              <a href={`/admin/users/${p.author.id}`}>@{p.author.username}</a>
              {p.author.status !== 'ACTIVE' ? (
                <>
                  {' '}
                  <Pill tone="alert">{p.author.status.toLowerCase()}</Pill>
                </>
              ) : null}{' '}
              · {when(p.createdAt)}
              {p.edited ? ' · edited' : ''} · score {p.score} · {p.comments} comment
              {p.comments === 1 ? '' : 's'}
              {p.media ? ` · ${p.media} picture${p.media === 1 ? '' : 's'} or video` : ''}
              {p.openReports ? (
                <>
                  {' '}
                  ·{' '}
                  <Pill tone="alert">
                    {p.openReports} open report{p.openReports === 1 ? '' : 's'}
                  </Pill>
                </>
              ) : null}
            </p>
            <p style={{ whiteSpace: 'pre-wrap', margin: '0 0 6px' }}>{p.body}</p>
            <a href={`/admin/cases/general/${p.id}`} style={{ fontSize: 14 }}>
              Open the full case (pictures, reports, the author’s record) →
            </a>
            <TopicPostActions postId={p.id} status={p.status} author={p.author} />
          </div>
        ))}
      </div>
      <Pager page={posts} base={base} params={{ tab }} />
    </>
  );
}
