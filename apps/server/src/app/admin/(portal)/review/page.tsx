import { REVIEW_KIND_LABELS, REVIEW_KINDS, type ReviewKind } from '@jax/shared';
import { reviewQueue, REVIEW_PAGE_SIZE } from '@/server/admin/review-queue';
import { ui } from '../../admin-ui';
import { requireAdminPage } from '../../require-admin-page';
import { hrefWith, Pager, Table, Tabs, td, when } from '../admin-table';

export const dynamic = 'force-dynamic';

/**
 * D242: the one review queue. Everything waiting for JaxSide (places, events, ads, organizers
 * to check, place and organizer changes), oldest sent first, each with a link to where it's
 * decided. Counts per kind on the tabs.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; page?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const kind = REVIEW_KINDS.includes(sp.kind as ReviewKind) ? (sp.kind as ReviewKind) : undefined;
  const q = await reviewQueue({ kind, page: Number(sp.page) || 1 });
  const all = Object.values(q.counts).reduce((n, c) => n + c, 0);
  return (
    <>
      <h1>Review queue</h1>
      <p style={ui.muted}>
        Everything waiting for you, oldest sent first. Open one to decide it; it leaves the list
        once decided.
      </p>
      <Tabs
        items={[
          { href: '/admin/review', label: `All (${all})`, on: !kind },
          ...REVIEW_KINDS.map((k) => ({
            href: hrefWith('/admin/review', {}, { kind: k }),
            label: `${REVIEW_KIND_LABELS[k]} (${q.counts[k]})`,
            on: k === kind,
          })),
        ]}
      />
      {q.total === 0 ? (
        <p style={ui.muted}>Nothing waiting. Nice.</p>
      ) : (
        <Table head={['Sent', 'Kind', 'What', 'From', '']}>
          {q.rows.map((r) => (
            <tr key={`${r.kind}:${r.id}`}>
              <td style={td}>{when(r.sentAt)}</td>
              <td style={td}>{REVIEW_KIND_LABELS[r.kind]}</td>
              <td style={td}>
                <strong>{r.title}</strong>
                {r.detail ? <div style={ui.muted}>{r.detail}</div> : null}
              </td>
              <td style={td}>{r.from ?? ''}</td>
              <td style={td}>
                <a href={r.href}>Open</a>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pager
        page={{ page: q.page, pages: q.pages, total: q.total, pageSize: REVIEW_PAGE_SIZE }}
        base="/admin/review"
        params={{ kind }}
      />
    </>
  );
}
