import { MAINTENANCE_TEXT, readMaintenance } from '@/server/maintenance';
import { ui } from '../../admin-ui';
import { MaintenanceSwitch } from '../../maintenance-form';
import { requireAdminPage } from '../../require-admin-page';

export const dynamic = 'force-dynamic';

/**
 * D246: the emergency switch. For large problems only: while it is on, the app shows
 * "JaxSide is currently having maintenance done", everyone was signed out when it was switched
 * on, and nobody can sign in. This portal keeps working so it can be switched off.
 */
export default async function MaintenancePage() {
  await requireAdminPage();
  const state = await readMaintenance();
  return (
    <>
      <h1>Maintenance</h1>
      <div style={{ ...ui.card, marginBottom: 12 }}>
        <p style={{ margin: '0 0 8px' }}>
          <strong>
            {state.on
              ? 'Maintenance is ON: the app is switched off.'
              : 'Maintenance is off: the app is running normally.'}
          </strong>
        </p>
        {state.on ? (
          <p style={{ ...ui.muted, margin: '0 0 8px' }}>
            On since {state.since ? state.since.toLocaleString('en-US') : 'unknown'}.
            {state.message ? ` Extra line shown: “${state.message}”` : ''}
          </p>
        ) : null}
        <p style={{ ...ui.muted, margin: '0 0 12px' }}>
          Everyone using the app sees “{MAINTENANCE_TEXT}” and can&rsquo;t do anything else.
          Switching it on also signs every app user out (they sign in again afterwards). This admin
          portal and the health check keep working. Use it only for a large problem.
        </p>
        <MaintenanceSwitch on={state.on} />
      </div>
    </>
  );
}
