import { SUBMIT_CATEGORIES } from '@jax/shared';
import { listSubmissions, submitterHistory } from '@/server/directory/submissions';
import { ui } from '../../admin-ui';
import { requireAdminPage } from '../../require-admin-page';
import { SubmissionQueue } from '../../submission-queue';

export const dynamic = 'force-dynamic';

const TABS = ['PENDING', 'APPROVED', 'REJECTED', 'MERGED', 'EXPIRED'] as const;
type Tab = (typeof TABS)[number];

/** P5.12: suggested places: tabs, filters, map, duplicates, approve/reject/merge, bulk. */
export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; submitter?: string; since?: string }>;
}) {
  await requireAdminPage();
  const q = await searchParams;
  const status: Tab = TABS.find((t) => t === q.status) ?? 'PENDING';
  const category = SUBMIT_CATEGORIES.find((c) => c === q.category);
  const submitter = q.submitter?.slice(0, 20) || undefined;
  const since = q.since ? new Date(q.since) : undefined;
  const items = await listSubmissions({
    status,
    category,
    submitter,
    since: since && !isNaN(since.getTime()) ? since : undefined,
  });
  const history = await submitterHistory([...new Set(items.map((s) => s.submitter.id))]);
  const link = (t: Tab) => {
    const p = new URLSearchParams({ status: t });
    if (category) p.set('category', category);
    if (submitter) p.set('submitter', submitter);
    return `/admin/submissions?${p}`;
  };

  return (
    <>
      <h1>Place suggestions</h1>
      <nav style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        {TABS.map((t) => (
          <a key={t} href={link(t)} style={{ fontWeight: t === status ? 800 : 400 }}>
            {t.toLowerCase()}
          </a>
        ))}
      </nav>
      <form method="get" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <input type="hidden" name="status" value={status} />
        <select
          name="category"
          defaultValue={category ?? ''}
          style={{ ...ui.input, width: 200, margin: 0 }}
        >
          <option value="">All categories</option>
          {SUBMIT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <input
          name="submitter"
          defaultValue={submitter}
          placeholder="Submitter username"
          style={{ ...ui.input, width: 200, margin: 0 }}
        />
        <input
          name="since"
          type="date"
          defaultValue={q.since}
          style={{ ...ui.input, width: 170, margin: 0 }}
          aria-label="Submitted since"
        />
        <button style={ui.button}>Filter</button>
      </form>
      <SubmissionQueue items={items} history={history} pending={status === 'PENDING'} />
    </>
  );
}
