import { listOrganizerNameChanges, listPlaceChanges } from '@/server/admin/change-requests';
import { ui } from '../../admin-ui';
import { ChangeDecision } from '../../event-forms';
import { requireAdminPage } from '../../require-admin-page';
import { Table, td, when } from '../admin-table';

export const dynamic = 'force-dynamic';

/**
 * D242 (D238 A): changes businesses asked for: a place's name, category, address or pin
 * (Owners), and organizer names. Approving makes the change for everyone in the app; turning
 * one down needs a note the business reads.
 */
export default async function ChangesPage() {
  await requireAdminPage();
  const [places, names] = await Promise.all([listPlaceChanges(), listOrganizerNameChanges()]);
  const pin = (lat: number | null, lng: number | null) =>
    lat !== null && lng !== null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : null;
  return (
    <>
      <h1>Change requests</h1>
      <h2>Place details ({places.total})</h2>
      {places.total === 0 ? (
        <p style={ui.muted}>None waiting.</p>
      ) : (
        <Table head={['Place', 'Now', 'Asked for', 'Note', 'Sent', '']}>
          {places.rows.map((r) => (
            <tr key={r.id}>
              <td style={td}>
                <a href={`/admin/places?q=${encodeURIComponent(r.place.name)}`}>{r.place.name}</a>
                <div style={ui.muted}>{r.from ?? ''}</div>
              </td>
              <td style={td}>
                {r.name ? <div>{r.place.name}</div> : null}
                {r.category ? <div>{r.place.category}</div> : null}
                {r.address ? <div>{r.place.address ?? 'no address'}</div> : null}
                {r.latitude !== null ? <div>{pin(r.place.latitude, r.place.longitude)}</div> : null}
              </td>
              <td style={td}>
                {r.name ? <div>Name: {r.name}</div> : null}
                {r.category ? <div>Category: {r.category}</div> : null}
                {r.address ? <div>Address: {r.address}</div> : null}
                {r.latitude !== null ? (
                  <div>
                    Pin:{' '}
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=18/${r.latitude}/${r.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {pin(r.latitude, r.longitude)}
                    </a>
                  </div>
                ) : null}
              </td>
              <td style={td}>{r.note ?? ''}</td>
              <td style={td}>{when(r.createdAt)}</td>
              <td style={td}>
                <ChangeDecision kind="place-changes" id={r.id} />
              </td>
            </tr>
          ))}
        </Table>
      )}
      <h2>Organizer names ({names.total})</h2>
      {names.total === 0 ? (
        <p style={ui.muted}>None waiting.</p>
      ) : (
        <Table head={['Now', 'Asked for', 'Note', 'Sent', '']}>
          {names.rows.map((r) => (
            <tr key={r.id}>
              <td style={td}>
                {r.currentName}
                <div style={ui.muted}>{r.from ?? ''}</div>
              </td>
              <td style={td}>
                <strong>{r.name}</strong>
              </td>
              <td style={td}>{r.note ?? ''}</td>
              <td style={td}>{when(r.createdAt)}</td>
              <td style={td}>
                <ChangeDecision kind="organizer-names" id={r.id} />
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
