import Link from 'next/link';
import { notFound } from 'next/navigation';
import { COLORS } from '@jax/shared';
import { listPosts } from '@/server/discussion';
import { ApiError } from '@/server/http';
import { TEXT } from '@/text';
import { requireAccount } from '../../../require-account';
import { Author, when } from './author';
import { NewPostForm } from './discussion-forms';

/** B1.6: the place's discussion. Anyone on its team; replies work from anywhere. */
export default async function DiscussionPage({
  params,
  searchParams,
}: {
  params: Promise<{ placeId: string }>;
  searchParams: Promise<{ before?: string }>;
}) {
  const account = await requireAccount();
  const { placeId } = await params;
  const { before } = await searchParams;
  let data;
  try {
    data = await listPosts(account, placeId, before);
  } catch (err) {
    if (err instanceof ApiError) notFound();
    throw err;
  }
  const { place, posts, nextBefore } = data;
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px' }}>
      <Link href={`/places/${place.id}`}>← {place.name}</Link>
      <h1>{TEXT.discussion.title}</h1>
      <p style={{ color: COLORS.textMuted }}>{TEXT.discussion.intro}</p>
      <NewPostForm placeId={place.id} />
      {posts.length === 0 ? <p>{TEXT.discussion.empty}</p> : null}
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
        {posts.map((p) => (
          <li key={p.id}>
            <Link
              href={`/places/${place.id}/discussion/${p.id}`}
              style={{
                display: 'block',
                padding: 16,
                background: COLORS.background,
                border: `1px solid ${COLORS.cardBorder}`,
                borderRadius: 12,
                color: COLORS.text,
                textDecoration: 'none',
              }}
            >
              <div style={{ marginBottom: 6 }}>
                <Author a={p.author} />{' '}
                <span style={{ color: COLORS.textMuted }}>· {when(p.createdAt)}</span>
                {p.held ? (
                  <span style={{ color: COLORS.textMuted }}> · {TEXT.discussion.held}</span>
                ) : null}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{p.body}</div>
              <div style={{ marginTop: 6, color: COLORS.textMuted }}>
                {TEXT.discussion.comments(p.commentCount)}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {nextBefore ? (
        <Link href={`/places/${place.id}/discussion?before=${encodeURIComponent(nextBefore)}`}>
          {TEXT.discussion.older}
        </Link>
      ) : null}
    </main>
  );
}
