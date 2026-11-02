import Link from 'next/link';
import { COLORS } from '@jax/shared';
import { getInbox } from '@/server/inbox';
import { TEXT } from '@/text';
import { when } from '../places/[placeId]/discussion/author';
import { requireAccount } from '../require-account';
import { MarkSeenButton } from './inbox-forms';

/** B1.8: what's new at each place, and messages from JaxSide. */
export default async function InboxPage() {
  const account = await requireAccount();
  const { places, notices } = await getInbox(account);
  const card = {
    padding: 16,
    background: COLORS.background,
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: 12,
    marginBottom: 12,
  };
  const quiet = places.every((p) => !p.newPostCount && !p.newCommentCount);
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px' }}>
      <Link href="/">← {TEXT.places.title}</Link>
      <h1>{TEXT.inbox.title}</h1>
      {quiet ? <p style={{ color: COLORS.textMuted }}>{TEXT.inbox.nothingNew}</p> : null}
      {places.map((p) =>
        p.newPostCount || p.newCommentCount ? (
          <section key={p.placeId} style={card}>
            <h2 style={{ marginTop: 0 }}>{p.placeName}</h2>
            <p style={{ color: COLORS.textMuted }}>{TEXT.inbox.since(when(p.since))}</p>
            {p.newPosts.length ? <h3>{TEXT.inbox.newPosts(p.newPostCount)}</h3> : null}
            <ul>
              {p.newPosts.map((post) => (
                <li key={post.id}>
                  <Link href={`/places/${p.placeId}/discussion/${post.id}`}>{post.excerpt}</Link>{' '}
                  <span style={{ color: COLORS.textMuted }}>· {when(post.createdAt)}</span>
                </li>
              ))}
            </ul>
            {p.commentedPosts.length ? <h3>{TEXT.inbox.newComments(p.newCommentCount)}</h3> : null}
            <ul>
              {p.commentedPosts.map((c) => (
                <li key={c.postId}>
                  <Link href={`/places/${p.placeId}/discussion/${c.postId}`}>{c.excerpt}</Link>{' '}
                  <span style={{ color: COLORS.textMuted }}>
                    · {TEXT.inbox.commentCount(c.count)}
                    {c.repliesToUs ? ` · ${TEXT.inbox.repliesToUs(c.repliesToUs)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <MarkSeenButton placeId={p.placeId} />
          </section>
        ) : null,
      )}
      <h2>{TEXT.inbox.fromJaxSide}</h2>
      {notices.length === 0 ? (
        <p style={{ color: COLORS.textMuted }}>{TEXT.inbox.noNotices}</p>
      ) : null}
      {notices.map((n) => (
        <div
          key={n.id}
          style={{ ...card, borderColor: n.read ? COLORS.cardBorder : COLORS.primary }}
        >
          <strong>{n.title}</strong>{' '}
          <span style={{ color: COLORS.textMuted }}>· {when(n.createdAt)}</span>
          {n.body ? <p style={{ marginBottom: 0 }}>{n.body}</p> : null}
          {n.link ? (
            <p style={{ marginBottom: 0 }}>
              <Link href={n.link}>{TEXT.inbox.open}</Link>
            </p>
          ) : null}
        </div>
      ))}
      <MarkSeenButton />
    </main>
  );
}
