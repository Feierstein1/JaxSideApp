/**
 * Runs the daily retention cleanup once (P2.5). Schedule it daily:
 * - production: the host's cron/scheduler, e.g. `0 4 * * *` (4 am)
 * - development: run by hand, or with Windows Task Scheduler
 *
 *   npm run jobs:maintenance -w @jax/server
 */
import { db } from '../../src/server/db';
import { runMaintenance } from '../../src/server/jobs/maintenance';

runMaintenance()
  .then((report) => {
    console.log(report ? { maintenance: report } : 'another maintenance run is in progress');
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
