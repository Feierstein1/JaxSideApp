/**
 * D275: after each health snapshot (every 10 minutes, deploy/staging/cron): emails new
 * problems, daily reminders and "all clear", and drops snapshots older than health.keepDays.
 *
 *   npm run jobs:health -w @jax/server
 */
import { db } from '../../src/server/db';
import { checkHealthAlerts } from '../../src/server/health';

checkHealthAlerts()
  .then((report) => {
    // Quiet when nothing changed (it runs every 10 minutes).
    if (report.newAlerts || report.cleared || report.emailed || report.pruned) {
      console.log(new Date().toISOString(), { health: report });
    }
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
