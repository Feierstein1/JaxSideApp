import { listOwnerClaims } from '@/server/directory/owners';
import { ui } from '../../admin-ui';
import { OwnerActions } from '../../forms';
import { requireAdminPage } from '../../require-admin-page';
import { Pager, Pill, when } from '../admin-table';
import { pageNumber } from '@/server/admin/paging';

export const dynamic = 'force-dynamic';

const TABS = ['PENDING', 'VERIFIED', 'REJECTED', 'REVOKED'] as const;
const LABEL = {
  PENDING: 'To check',
  VERIFIED: 'Owners',
  REJECTED: 'Rejected',
  REVOKED: 'Tag removed',
};
const HOW = {
  EMAIL: 'Business email',
  WEBSITE: 'Code on website / social page',
  PHONE: 'Phone call',
  TEAM: 'Added by the primary owner', // D157
};

/**
 * D103: owner claims. To check: website/social proofs (open the link and look for the code),
 * phone calls (call the business's public number and read the code), and second owners for
 * a place that already has one. Owners: remove the tag for misuse.
 */
export default async function OwnersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdminPage();
  const q = await searchParams;
  const status = TABS.find((t) => t === q.status) ?? 'PENDING';
  const list = await listOwnerClaims(status, pageNumber(q.page));
  const rows = list.rows;
  return (
    <>
      <h1>Business owners</h1>
      <nav style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
        {TABS.map((t) => (
          <a
            key={t}
            href={`/admin/owners?status=${t}`}
            style={{ fontWeight: t === status ? 800 : 400 }}
          >
            {LABEL[t]}
          </a>
        ))}
      </nav>
      {list.total === 0 ? <p style={ui.muted}>Nothing here.</p> : null}
      <div style={{ display: 'grid', gap: 16 }}>
        {rows.map((c) => (
          <div key={c.id} style={ui.card}>
            <p style={{ marginTop: 0 }}>
              <strong>{c.place.name}</strong> ·{' '}
              <a href={`/admin/users/${c.user.id}`}>@{c.user.username}</a>{' '}
              <Pill>{HOW[c.method]}</Pill> · {when(c.createdAt.toISOString())}
            </p>
            {c.method === 'WEBSITE' ? (
              <p>
                Look for the code <strong>{c.publicCode}</strong> at{' '}
                {c.proofUrl ? (
                  <a href={c.proofUrl} target="_blank" rel="noreferrer noopener">
                    {c.proofUrl}
                  </a>
                ) : (
                  '(no link yet)'
                )}
                {c.place.website ? (
                  <>
                    {' '}
                    · place’s website on file:{' '}
                    <a href={c.place.website} target="_blank" rel="noreferrer noopener">
                      {c.place.website}
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
            {c.method === 'PHONE' && c.status === 'PENDING' ? (
              <p>
                Call <strong>{c.place.phone}</strong> (the number on file, not one the person gives
                you), ask for the owner, and read them the code <strong>{c.phoneCode}</strong>. They
                enter it in the app, which verifies them. Or approve here after the call.
              </p>
            ) : null}
            {c.method === 'EMAIL' ? <p>Confirmed a code sent to @{c.emailDomain}.</p> : null}
            {c.note ? <p style={ui.muted}>Note: {c.note}</p> : null}
            {c.decidedBy ? <p style={ui.muted}>Decided by @{c.decidedBy.username}</p> : null}
            <OwnerActions id={c.id} status={c.status} primary={c.primary} />
          </div>
        ))}
      </div>
      <Pager page={list} base="/admin/owners" params={{ status }} />
    </>
  );
}
