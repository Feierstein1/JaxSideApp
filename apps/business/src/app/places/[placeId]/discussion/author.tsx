import { COLORS } from '@jax/shared';
import type { AuthorView } from '@/server/discussion';
import { TEXT } from '@/text';

/** How an author is shown here: the public view, plus who wrote it (Owner only). */
export function Author({ a }: { a: AuthorView }) {
  if ('theOwner' in a) {
    return (
      <span>
        <strong>
          {a.staffName ? `${TEXT.discussion.theOwner} · ${a.staffName}` : TEXT.discussion.theOwner}
        </strong>
        {a.writtenBy ? (
          <span style={{ color: COLORS.textMuted }}>
            {' '}
            ({TEXT.discussion.writtenBy(a.writtenBy)})
          </span>
        ) : null}
      </span>
    );
  }
  if ('guest' in a) return <span>{TEXT.discussion.guest}</span>;
  if ('deleted' in a)
    return <span style={{ color: COLORS.textMuted }}>{TEXT.discussion.deleted}</span>;
  return <strong>@{a.username}</strong>;
}

export function when(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
