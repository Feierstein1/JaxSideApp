/**
 * Removes expired rate-limit counters once (P13.3, D109). Schedule it every 10 minutes:
 * - production: the host's cron/scheduler, e.g. `0,10,20,30,40,50 * * * *`

 * - development: optional (the daily maintenance job also does it); run by hand or with
 *   Windows Task Scheduler
 *
 *   npm run jobs:counters -w @jax/server
 */
import { db } from '../../src/server/db';
import { runCounterCleanup } from '../../src/server/jobs/counters';

runCounterCleanup()
  .then((removed) => {
    console.log(removed === null ? 'another cleanup run is in progress' : { removed });
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
