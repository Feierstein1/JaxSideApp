import { beforeEach, describe, expect, it } from 'vitest';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { checkHealthAlerts, findProblems, healthDashboard, recordJobRun } from '@/server/health';
import { sendSafely, setMailer } from '@/server/mail/mailer';
import { resetDb } from './db-helpers';
import { captureMailer } from './http-helpers';

// D275: server health on the dashboard, and its alerts.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const MB = 1024 * 1024;
const NOW = new Date('2026-11-20T18:00:00Z');
const TO = 'owner@example.test';
let mail: ReturnType<typeof captureMailer>;

const healthy = {
  memTotalMb: 3832,
  memAvailableMb: 2700,
  swapUsedMb: 300,
  diskTotalMb: 78_000,
  diskUsedMb: 14_000,
  load1: 0.1,
  load15: 0.1,
  dbBytes: BigInt(37 * MB),
  appUp: true,
  webUp: true,
  containers: [
    { name: 'jaxside-app-1', memMb: 200, limitMb: 3832 },
    { name: 'jaxside-web-jaxside-web-1', memMb: 186, limitMb: 768 },
  ],
};
type Sample = Partial<typeof healthy> & {
  s3MediaBytes?: bigint;
  s3MediaObjects?: number;
  s3BackupsBytes?: bigint;
  s3BackupsObjects?: number;
};
const sample = (agoMs: number, over: Sample = {}) =>
  db.serverHealthSample.create({
    data: { ...healthy, ...over, takenAt: new Date(NOW.getTime() - agoMs) },
  });
const goodJobs = async () => {
  await recordJobRun('backup', true, 'ok', new Date(NOW.getTime() - 15 * HOUR));
  await recordJobRun('maintenance', true, undefined, new Date(NOW.getTime() - 14 * HOUR));
};
const keys = async (now = NOW) => (await findProblems(now)).map((p) => p.key).sort();
const alertMails = () => mail.sent.filter((m) => m.subject.startsWith('JaxSide health'));

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  mail = captureMailer();
  setMailer(mail.mailer);
});

describe('the dashboard’s Server health (D275)', () => {
  it('says so before the first snapshot', async () => {
    expect((await healthDashboard(NOW)).latest).toBeNull();
    expect(await keys()).toEqual([]); // a fresh install isn't a problem
  });

  it('shows the latest numbers, growth per week, the disk forecast, averages and the cost', async () => {
    await sample(7 * DAY, {
      diskUsedMb: 13_000,
      dbBytes: BigInt(30 * MB),
      memAvailableMb: 2500,
      s3MediaBytes: BigInt(20 * MB),
      s3MediaObjects: 60,
      s3BackupsBytes: BigInt(70 * MB),
      s3BackupsObjects: 50,
    });
    await sample(10 * MIN, {
      s3MediaBytes: BigInt(1024 * MB),
      s3MediaObjects: 72,
      s3BackupsBytes: BigInt(1024 * MB),
      s3BackupsObjects: 52,
    });
    await sample(0);
    await goodJobs();
    await db.emailDailyCount.create({ data: { day: new Date('2026-11-19'), count: 2000 } });
    await db.emailDailyCount.create({ data: { day: new Date('2026-10-30'), count: 999 } }); // last month

    const h = await healthDashboard(NOW);
    expect(h.latest).toMatchObject({ fresh: true, appUp: true, diskUsedMb: 14_000 });
    expect(h.latest!.containers).toHaveLength(2);
    expect(h.growthPerWeek.diskMb).toBeCloseTo(1000, 0);
    expect(h.growthPerWeek.dbBytes).toBeCloseTo(7 * MB, -4);
    // 64 GB left at 1 GB a week: about 448 days.
    expect(h.daysToFull).toBeGreaterThan(440);
    expect(h.daysToFull).toBeLessThan(460);
    expect(h.s3).toMatchObject({ mediaObjects: 72, backupsObjects: 52 });
    expect(h.averages.week.samples).toBe(3);
    expect(h.jobs.backup).toMatchObject({ lastOk: true, lastNote: 'ok' });
    // $24 server + 2 GB × $0.023 + 2000 emails × $0.10 / 1000.
    expect(h.cost).toMatchObject({ server: 24, s3: 0.05, email: 0.2, emailsThisMonth: 2000 });
    expect(h.cost.total).toBe(24.25);
  });

  it('counts every email sent (for the cost estimate)', async () => {
    await sendSafely({ to: 'a@example.test', subject: 'x', text: 'y' }, 'test');
    await sendSafely({ to: 'b@example.test', subject: 'x', text: 'y' }, 'test');
    const rows = await db.emailDailyCount.findMany();
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(2);
  });
});

describe('health alerts (D275)', () => {
  it('a healthy server with fresh backups has no problems', async () => {
    await sample(10 * MIN);
    await sample(0);
    await goodJobs();
    expect(await keys()).toEqual([]);
  });

  it('flags a full disk, low memory twice in a row, a capped container near its limit, and a site that’s down twice', async () => {
    await goodJobs();
    await sample(10 * MIN, { memAvailableMb: 300, webUp: false, appUp: false });
    await sample(0, {
      diskUsedMb: 70_000,
      memAvailableMb: 350,
      webUp: false,
      containers: [{ name: 'jaxside-web-jaxside-web-1', memMb: 720, limitMb: 768 }],
    });
    expect(await keys()).toEqual([
      'container.jaxside-web-jaxside-web-1',
      'disk.full',
      'memory.low',
      'web.down',
    ]);
  });

  it('one bad snapshot isn’t an alert; a container sharing the server’s memory isn’t either', async () => {
    await goodJobs();
    await sample(10 * MIN);
    await sample(0, {
      memAvailableMb: 300,
      webUp: false,
      containers: [{ name: 'jaxside-app-1', memMb: 3700, limitMb: 3832 }],
    });
    expect(await keys()).toEqual([]);
  });

  it('a failed or missing backup and maintenance', async () => {
    await sample(2 * DAY); // tracking started two days ago
    await sample(0);
    await recordJobRun('backup', false, 'exit 1', new Date(NOW.getTime() - HOUR));
    expect(await keys()).toEqual(['backup.failed', 'backup.stale', 'maintenance.stale']);
  });

  it('a stopped collector, and numbers that jump too quickly', async () => {
    await goodJobs();
    await sample(DAY + 20 * MIN, { dbBytes: BigInt(60 * MB), s3MediaBytes: BigInt(100 * MB) });
    await sample(40 * MIN, { dbBytes: BigInt(200 * MB), s3MediaBytes: BigInt(1300 * MB) });
    expect(await keys()).toEqual(['db.jump', 's3.jump', 'sample.stale']);
  });

  it('emails a new problem once, reminds after a day, and says all clear when it ends', async () => {
    await goodJobs();
    await sample(10 * MIN, { diskUsedMb: 70_000 });
    await sample(0, { diskUsedMb: 70_000 });
    expect(await checkHealthAlerts(NOW, TO)).toMatchObject({ newAlerts: 1, emailed: true });
    expect(alertMails()).toHaveLength(1);
    expect(alertMails()[0]).toMatchObject({ to: TO, subject: 'JaxSide health: 1 problem' });
    expect(alertMails()[0]!.text).toContain('disk is 90% full');

    // Ten minutes later: still full, no second email.
    await sample(-10 * MIN, { diskUsedMb: 70_000 });
    await checkHealthAlerts(new Date(NOW.getTime() + 10 * MIN), TO);
    expect(alertMails()).toHaveLength(1);
    expect((await healthDashboard(NOW)).alerts.map((a) => a.key)).toEqual(['disk.full']);

    // A day later: a reminder.
    await recordJobRun('backup', true, 'ok', new Date(NOW.getTime() + DAY));
    await recordJobRun('maintenance', true, undefined, new Date(NOW.getTime() + DAY));
    await sample(-DAY, { diskUsedMb: 70_000 });
    await checkHealthAlerts(new Date(NOW.getTime() + DAY + MIN), TO);
    expect(alertMails()).toHaveLength(2);

    // Cleaned up: all clear, and the alert is gone.
    await sample(-DAY - 10 * MIN);
    await checkHealthAlerts(new Date(NOW.getTime() + DAY + 11 * MIN), TO);
    expect(alertMails()).toHaveLength(3);
    expect(alertMails()[2]).toMatchObject({ subject: 'JaxSide health: all clear' });
    expect(alertMails()[2]!.text).toContain('Fixed: The server’s disk is 90% full');
    expect(await db.healthAlert.count()).toBe(0);
  });

  it('without an address it still tracks alerts (shown on the dashboard), and drops old snapshots', async () => {
    await goodJobs();
    await sample(40 * DAY);
    await sample(10 * MIN, { diskUsedMb: 70_000 });
    await sample(0, { diskUsedMb: 70_000 });
    const r = await checkHealthAlerts(NOW, null);
    expect(r).toMatchObject({ emailed: false, newAlerts: 1, pruned: 1 });
    expect(alertMails()).toHaveLength(0);
    expect(await db.healthAlert.count()).toBe(1);
  });
});
