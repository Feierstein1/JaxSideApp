/**
 * Runs the daily retention cleanup once (P2.5). Schedule it daily:
 * - production: the host's cron/scheduler, e.g. `0 4 * * *` (4 am)
 * - development: run by hand, or with Windows Task Scheduler
 *
 *   npm run jobs:maintenance -w @jax/server
 */
import { db } from '../../src/server/db';
import { recordJobRun } from '../../src/server/health';
import { runMaintenance } from '../../src/server/jobs/maintenance';

runMaintenance()
  .then(async (report) => {
    console.log(report ? { maintenance: report } : 'another maintenance run is in progress');
    // D275: the dashboard shows when it last worked (a run skipped for the lock isn't one).
    if (report) await recordJobRun('maintenance', true);
  })
  .catch(async (e) => {
    console.error(e);
    process.exitCode = 1;
    await recordJobRun('maintenance', false, e instanceof Error ? e.message : String(e));
  })
  .finally(() => db.$disconnect());
