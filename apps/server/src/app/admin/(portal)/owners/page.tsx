import { pageNumber } from '@/server/admin/paging';
import { listPlaceRequests } from '@/server/admin/place-requests';
import { ui } from '../../admin-ui';
import { PlaceRequestActions } from '../../forms';
import { requireAdminPage } from '../../require-admin-page';
import { Pager, Pill, when } from '../admin-table';

export const dynamic = 'force-dynamic';

const TABS = ['PENDING', 'APPROVED', 'REJECTED'] as const;
const LABEL = { PENDING: 'To check', APPROVED: 'Approved', REJECTED: 'Turned down' };

/**
 * D185 / D224 (B6.4): requests from the owner website. "Verify me" names a place already on
 * the map; "Add my business" brings a new one with the pin the owner confirmed. Check that
 * the person really runs the place (call the number on file, look it up), then approve:
 * a new place goes on the map and the business gets Owner access and its free month.
 * Personal app accounts never come into it (D185); owners are business logins only.
 */
export default async function OwnersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdminPage();
  const q = await searchParams;
  const status = TABS.find((t) => t === q.status) ?? 'PENDING';
  const list = await listPlaceRequests(status, pageNumber(q.page));
  return (
    <>
      <h1>Business owners</h1>
      <p style={ui.muted}>
        Owners sign up and verify on the JaxSide for Business website. Those who can’t verify with
        Google, or whose place isn’t on the map yet, ask here.
      </p>
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
        {list.rows.map((r) => (
          <div key={r.id} style={ui.card}>
            <p style={{ marginTop: 0 }}>
              <Pill tone={r.kind === 'new' ? 'alert' : undefined}>
                {r.kind === 'new' ? 'Add my business' : 'Verify me'}
              </Pill>{' '}
              <strong>{r.place?.name ?? r.typed.name}</strong> · from{' '}
              <a href={`/admin/businesses/${r.business.id}`}>{r.business.login}</a> ·{' '}
              {when(r.createdAt)}
            </p>
            {r.kind === 'new' ? (
              <p>
                {r.typed.address ?? 'No address'} · {r.typed.category ?? 'no kind'}
                {r.typed.pin ? (
                  <>
                    {' '}
                    ·{' '}
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${r.typed.pin.latitude}&mlon=${r.typed.pin.longitude}#map=19/${r.typed.pin.latitude}/${r.typed.pin.longitude}`}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      see the pin
                    </a>
                  </>
                ) : (
                  ' · no pin'
                )}
              </p>
            ) : (
              <p>
                {r.place?.address ?? ''}
                {r.hasOwner ? <Pill tone="alert">already has an owner</Pill> : null}
              </p>
            )}
            {r.nearby.length ? (
              <p style={ui.muted}>
                Near the pin: {r.nearby.map((p) => `${p.name} (${p.meters} m)`).join(', ')}
              </p>
            ) : null}
            <p style={ui.muted}>
              Contact: {r.contact.name}
              {r.contact.phone ? ` · ${r.contact.phone}` : ''}
              {r.note ? ` · “${r.note}”` : ''}
            </p>
            {r.status === 'PENDING' ? (
              <PlaceRequestActions id={r.id} nearby={r.nearby} />
            ) : (
              <p style={ui.muted}>
                {LABEL[r.status as keyof typeof LABEL]}
                {r.decidedAt ? ` ${when(r.decidedAt)}` : ''}
                {r.decisionNote ? `: ${r.decisionNote}` : ''}
              </p>
            )}
          </div>
        ))}
      </div>
      <Pager page={list} base="/admin/owners" params={{ status }} />
    </>
  );
}
