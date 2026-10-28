import { adminSearchPlaces } from '@/server/directory/admin-places';
import { ui } from '../../admin-ui';
import { AddPlaceForm, RemovePlaceButton } from '../../forms';
import { requireAdminPage } from '../../require-admin-page';
import { Pill, Table, td, words } from '../admin-table';

export const dynamic = 'force-dynamic';

/**
 * D146: every place in the directory. Find one by name and take it down now (no request
 * needed; Removals → Removed has Keep to undo), or add a place without waiting for votes.
 */
export default async function AllPlacesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdminPage();
  const q = ((await searchParams).q ?? '').trim();
  const rows = q ? await adminSearchPlaces(q) : [];
  return (
    <>
      <h1>All places</h1>
      <p style={ui.muted}>
        Find any place to remove it now, or add one yourself. Community suggestions and removal
        requests are still under Places and Removals.
      </p>
      <form method="get" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          style={{ ...ui.input, margin: 0, maxWidth: 360 }}
          name="q"
          defaultValue={q}
          placeholder="Place name"
          aria-label="Place name"
        />
        <button style={ui.button} type="submit">
          Search
        </button>
      </form>
      {q && rows.length === 0 ? <p style={ui.muted}>No places match “{q}”.</p> : null}
      {rows.length ? (
        <Table head={['Place', 'Category', 'Address', 'Posts', 'Favorites', 'Status', '']}>
          {rows.map((p) => (
            <tr key={p.id}>
              <td style={td}>{p.name}</td>
              <td style={td}>{words(p.category)}</td>
              <td style={td}>{p.address ?? ''}</td>
              <td style={td}>{p.postCount}</td>
              <td style={td}>{p.favorites}</td>
              <td style={td}>
                <Pill tone={p.status === 'ACTIVE' ? 'ok' : 'alert'}>{words(p.status)}</Pill>
              </td>
              <td style={td}>
                {p.status === 'ACTIVE' ? (
                  <RemovePlaceButton placeId={p.id} name={p.name} />
                ) : (
                  <a href="/admin/removals?status=REMOVED">Restore in Removals</a>
                )}
              </td>
            </tr>
          ))}
        </Table>
      ) : null}
      <AddPlaceForm />
    </>
  );
}
