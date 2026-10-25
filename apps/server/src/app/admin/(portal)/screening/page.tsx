import { SCREENING_ACTIONS, SCREENING_CATEGORIES } from '@jax/shared';
import { listRules } from '@/server/admin/screening-rules';
import { ui } from '../../admin-ui';
import { requireAdminPage } from '../../require-admin-page';
import { AddScreeningRule, ScreeningRuleControls, ScreeningTest } from '../../screening-forms';
import { Table, td } from '../admin-table';

export const dynamic = 'force-dynamic';

/**
 * P15.9: words and phrases checked in posts, comments, topics, bios and usernames. Matching
 * sees through spacing, symbols, look-alike letters and stretched letters. Ordinary profanity
 * is allowed (D56); this list is for slurs, threats and the like.
 */
export default async function ScreeningPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; action?: string; off?: string }>;
}) {
  await requireAdminPage();
  const q = await searchParams;
  const all = await listRules();
  const rules = all.filter(
    (r) =>
      (!q.category || r.category === q.category) &&
      (!q.action || r.action === q.action) &&
      (q.off === '1' ? !r.enabled : true),
  );
  const link = (params: Record<string, string>) =>
    `/admin/screening?${new URLSearchParams(params).toString()}`;
  return (
    <>
      <h1>Screening</h1>
      <p style={ui.muted}>
        Words and phrases checked before anything is posted. <strong>Block</strong> refuses it,{' '}
        <strong>Hold</strong> saves it hidden for review in Reports, <strong>Warn</strong> asks the
        person to confirm. Disguises like “k1ll”, “k i l l” and look-alike letters are caught.
        Ordinary swearing is allowed; this list is for slurs, threats and the like. Changes apply
        within about 30 seconds.
      </p>
      <h2>Test</h2>
      <ScreeningTest />
      <h2>Add a term</h2>
      <AddScreeningRule />
      <h2>
        Terms ({rules.length}
        {rules.length !== all.length ? ` of ${all.length}` : ''})
      </h2>
      <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <a href="/admin/screening">All</a>
        {SCREENING_CATEGORIES.map((c) => (
          <a key={c} href={link({ category: c })}>
            {c.toLowerCase()}
          </a>
        ))}
        <span style={ui.muted}>|</span>
        {SCREENING_ACTIONS.map((a) => (
          <a key={a} href={link({ action: a })}>
            {a.toLowerCase()}
          </a>
        ))}
        <a href={link({ off: '1' })}>turned off</a>
      </nav>
      <Table head={['Term', 'Category', 'Match', 'Status', '']}>
        {rules.map((r) => (
          <tr key={r.id} style={r.enabled ? undefined : { opacity: 0.55 }}>
            <td style={td}>
              <strong>{r.term}</strong>
              {r.message ? <div style={{ ...ui.muted, fontSize: 13 }}>{r.message}</div> : null}
            </td>
            <td style={td}>{r.category.toLowerCase()}</td>
            <td style={td}>{r.match === 'WORD' ? 'whole word' : 'anywhere'}</td>
            <td style={td}>{r.enabled ? 'on' : 'off'}</td>
            <td style={td}>
              <ScreeningRuleControls id={r.id} action={r.action} enabled={r.enabled} />
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
