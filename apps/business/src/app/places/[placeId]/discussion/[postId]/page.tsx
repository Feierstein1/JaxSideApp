import Link from 'next/link';
import { notFound } from 'next/navigation';
import { COLORS } from '@jax/shared';
import { getThread } from '@/server/discussion';
import { ApiError } from '@/server/http';
import { TEXT } from '@/text';
import { requireAccount } from '../../../../require-account';
import { Author, when } from '../author';
import { RemoveButton, ReplyForm } from '../discussion-forms';

/** B1.6: one post and its comments; reply to the post or to a comment. */
export default async function ThreadPage({
  params,
}: {
  params: Promise<{ placeId: string; postId: string }>;
}) {
  const account = await requireAccount();
  const { placeId, postId } = await params;
  let data;
  try {
    data = await getThread(account, placeId, postId);
  } catch (err) {
    if (err instanceof ApiError) notFound();
    throw err;
  }
  const { place, post, comments, commentsLocked } = data;
  const card = {
    padding: 16,
    background: COLORS.background,
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: 12,
  };
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px' }}>
      <Link href={`/places/${place.id}/discussion`}>← {TEXT.discussion.title}</Link>
      <article style={{ ...card, marginTop: 16 }}>
        <div style={{ marginBottom: 6 }}>
          <Author a={post.author} />{' '}
          <span style={{ color: COLORS.textMuted }}>· {when(post.createdAt)}</span>
          {post.held ? (
            <span style={{ color: COLORS.textMuted }}> · {TEXT.discussion.held}</span>
          ) : null}
        </div>
        <div style={{ whiteSpace: 'pre-wrap' }}>{post.body}</div>
        {post.ours ? (
          <RemoveButton
            path={`/api/places/${place.id}/posts/${post.id}/delete`}
            back={`/places/${place.id}/discussion`}
          />
        ) : null}
      </article>

      <h2>{TEXT.discussion.comments(post.commentCount)}</h2>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
        {comments.map((c) => (
          <li key={c.id} style={{ ...card, marginLeft: c.depth * 24 }}>
            <div style={{ marginBottom: 6 }}>
              <Author a={c.author} />{' '}
              <span style={{ color: COLORS.textMuted }}>· {when(c.createdAt)}</span>
              {c.status === 'held' ? (
                <span style={{ color: COLORS.textMuted }}> · {TEXT.discussion.held}</span>
              ) : null}
            </div>
            {c.body !== null ? (
              <div style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
            ) : (
              <div style={{ color: COLORS.textMuted }}>
                {c.status === 'deleted'
                  ? TEXT.discussion.commentDeleted
                  : TEXT.discussion.commentRemoved}
              </div>
            )}
            {c.status === 'visible' && !commentsLocked ? (
              <ReplyForm placeId={place.id} postId={post.id} parentCommentId={c.id} compact />
            ) : null}
            {c.ours && (c.status === 'visible' || c.status === 'held') ? (
              <RemoveButton path={`/api/places/${place.id}/comments/${c.id}/delete`} />
            ) : null}
          </li>
        ))}
      </ul>
      {commentsLocked ? (
        <p style={{ color: COLORS.textMuted }}>{TEXT.discussion.locked}</p>
      ) : (
        <ReplyForm placeId={place.id} postId={post.id} />
      )}
    </main>
  );
}
