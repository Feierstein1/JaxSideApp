import { getConfig } from '../config';
import { db } from '../db';
import { getEnv } from '../env';
import { logger } from '../logger';
import { sendSafely } from '../mail/mailer';
import { renderEmail } from '../mail/layout';

/**
 * D275: server health for the admin dashboard, and alerts.
 *
 * The server records a snapshot every 10 minutes (`deploy/staging/health.sh`: memory, disk,
 * load, each container's memory, the database size, whether the app and website answer; the S3
 * sizes once a day) into `ServerHealthSample`. Backups and the nightly maintenance record each
 * run in `JobRun`. The portal reads those (it reaches the database through the SSH tunnel; it
 * can't see the server itself). `checkHealthAlerts` runs after each snapshot and emails problems.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MB = 1024 * 1024;
const GB = 1024 * MB;

export const JOBS = { backup: 'backup', maintenance: 'maintenance' } as const;
export type JobName = (typeof JOBS)[keyof typeof JOBS];

/** One backup or maintenance run (called by the job itself). Never throws. */
export async function recordJobRun(job: JobName, ok: boolean, note?: string, now = new Date()) {
  try {
    await db.jobRun.create({
      data: { job, ok, note: note?.slice(0, 500) ?? null, finishedAt: now },
    });
  } catch (err) {
    logger.warn({ err, job }, 'job run not recorded');
  }
}

export interface ContainerMem {
  name: string;
  memMb: number;
  limitMb: number;
}

const containersOf = (v: unknown): ContainerMem[] =>
  Array.isArray(v)
    ? v.filter(
        (c): c is ContainerMem =>
          !!c &&
          typeof c.name === 'string' &&
          typeof c.memMb === 'number' &&
          typeof c.limitMb === 'number',
      )
    : [];

/** The newest sample at or before `at` (for "a week ago" comparisons). */
const sampleBefore = (at: Date) =>
  db.serverHealthSample.findFirst({
    where: { takenAt: { lte: at } },
    orderBy: { takenAt: 'desc' },
  });

/** The newest sample with S3 sizes, at or before `at`. */
const s3Before = (at: Date) =>
  db.serverHealthSample.findFirst({
    where: { takenAt: { lte: at }, s3MediaBytes: { not: null } },
    orderBy: { takenAt: 'desc' },
  });

async function lastRuns(job: JobName) {
  const [last, lastOk] = await Promise.all([
    db.jobRun.findFirst({ where: { job }, orderBy: { finishedAt: 'desc' } }),
    db.jobRun.findFirst({ where: { job, ok: true }, orderBy: { finishedAt: 'desc' } }),
  ]);
  return { last, lastOk };
}

async function averages(since: Date) {
  const [row] = await db.$queryRaw<
    { memAvailableMb: number | null; load15: number | null; samples: bigint }[]
  >`
    SELECT avg("memAvailableMb")::float AS "memAvailableMb", avg("load15")::float AS "load15",
           count(*) AS samples
    FROM "ServerHealthSample" WHERE "takenAt" >= ${since}`;
  return {
    memAvailableMb:
      row?.memAvailableMb === null || row?.memAvailableMb === undefined
        ? null
        : Math.round(row.memAvailableMb),
    load15: row?.load15 ?? null,
    samples: Number(row?.samples ?? 0),
  };
}

/** Growth per week from two values `ms` apart (null when there's nothing to compare). */
const perWeek = (
  now: bigint | number | null | undefined,
  then: bigint | number | null | undefined,
  ms: number,
) =>
  now === null || now === undefined || then === null || then === undefined || ms < HOUR
    ? null
    : ((Number(now) - Number(then)) / ms) * 7 * DAY;

/** Everything the dashboard's Server health section shows. */
export async function healthDashboard(now = new Date()) {
  const latest = await db.serverHealthSample.findFirst({ orderBy: { takenAt: 'desc' } });
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [
    weekSample,
    s3Latest,
    s3Week,
    avg7,
    avg30,
    backup,
    maintenance,
    alerts,
    emailsMonth,
    sampleMax,
    prices,
  ] = await Promise.all([
    sampleBefore(weekAgo),
    s3Before(now),
    s3Before(weekAgo),
    averages(weekAgo),
    averages(new Date(now.getTime() - 30 * DAY)),
    lastRuns(JOBS.backup),
    lastRuns(JOBS.maintenance),
    db.healthAlert.findMany({ orderBy: { since: 'asc' } }),
    db.emailDailyCount.aggregate({ _sum: { count: true }, where: { day: { gte: monthStart } } }),
    getConfig('health.sampleMaxMinutes'),
    Promise.all([
      getConfig('costs.serverMonthlyUsd'),
      getConfig('costs.s3PerGbMonthUsd'),
      getConfig('costs.sesPer1000Usd'),
    ]),
  ]);
  // Compare with the oldest sample we have when there's no week of history yet.
  const base =
    weekSample ?? (await db.serverHealthSample.findFirst({ orderBy: { takenAt: 'asc' } }));
  const span = latest && base ? latest.takenAt.getTime() - base.takenAt.getTime() : 0;
  const s3Base =
    s3Week ??
    (await db.serverHealthSample.findFirst({
      where: { s3MediaBytes: { not: null } },
      orderBy: { takenAt: 'asc' },
    }));
  const s3Span = s3Latest && s3Base ? s3Latest.takenAt.getTime() - s3Base.takenAt.getTime() : 0;

  const diskGrowthMbWeek = perWeek(latest?.diskUsedMb, base?.diskUsedMb, span);
  const diskLeftMb = latest ? latest.diskTotalMb - latest.diskUsedMb : null;
  const daysToFull =
    diskLeftMb !== null && diskGrowthMbWeek && diskGrowthMbWeek > 0
      ? Math.round((diskLeftMb / diskGrowthMbWeek) * 7)
      : null;

  const [serverMonthly, s3PerGb, sesPer1000] = prices;
  const s3Gb = s3Latest
    ? (Number(s3Latest.s3MediaBytes ?? 0) + Number(s3Latest.s3BackupsBytes ?? 0)) / GB
    : 0;
  const emails = emailsMonth._sum.count ?? 0;
  const cost = {
    server: serverMonthly,
    s3: Math.round(s3Gb * s3PerGb * 100) / 100,
    email: Math.round((emails / 1000) * sesPer1000 * 100) / 100,
    emailsThisMonth: emails,
  };

  return {
    latest: latest
      ? {
          takenAt: latest.takenAt.toISOString(),
          fresh: now.getTime() - latest.takenAt.getTime() <= sampleMax * 60_000,
          appUp: latest.appUp,
          webUp: latest.webUp,
          memTotalMb: latest.memTotalMb,
          memAvailableMb: latest.memAvailableMb,
          swapUsedMb: latest.swapUsedMb,
          diskTotalMb: latest.diskTotalMb,
          diskUsedMb: latest.diskUsedMb,
          load1: latest.load1,
          load15: latest.load15,
          dbBytes: Number(latest.dbBytes),
          containers: containersOf(latest.containers),
        }
      : null,
    growthPerWeek: {
      diskMb: diskGrowthMbWeek,
      dbBytes: perWeek(latest?.dbBytes, base?.dbBytes, span),
      s3MediaBytes: perWeek(s3Latest?.s3MediaBytes, s3Base?.s3MediaBytes, s3Span),
      s3BackupsBytes: perWeek(s3Latest?.s3BackupsBytes, s3Base?.s3BackupsBytes, s3Span),
      /** How much history the growth is measured over (days). */
      overDays: Math.round((span / DAY) * 10) / 10,
    },
    daysToFull,
    s3: s3Latest
      ? {
          takenAt: s3Latest.takenAt.toISOString(),
          mediaBytes: Number(s3Latest.s3MediaBytes ?? 0),
          mediaObjects: s3Latest.s3MediaObjects ?? 0,
          backupsBytes: Number(s3Latest.s3BackupsBytes ?? 0),
          backupsObjects: s3Latest.s3BackupsObjects ?? 0,
        }
      : null,
    averages: { week: avg7, month: avg30 },
    jobs: {
      backup: jobView(backup),
      maintenance: jobView(maintenance),
    },
    cost: { ...cost, total: Math.round((cost.server + cost.s3 + cost.email) * 100) / 100 },
    alerts: alerts.map((a) => ({ key: a.key, since: a.since.toISOString(), detail: a.detail })),
  };
}

const jobView = (r: Awaited<ReturnType<typeof lastRuns>>) => ({
  lastAt: r.last?.finishedAt.toISOString() ?? null,
  lastOk: r.last?.ok ?? null,
  lastNote: r.last?.note ?? null,
  lastGoodAt: r.lastOk?.finishedAt.toISOString() ?? null,
});

// ───────────────────────────── Alerts ─────────────────────────────

interface Problem {
  key: string;
  detail: string;
}

const fmtMb = (mb: number) =>
  mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
const hoursAgo = (d: Date, now: Date) => Math.round((now.getTime() - d.getTime()) / HOUR);

/** What's wrong right now (an empty list when all is well). */
export async function findProblems(now = new Date()): Promise<Problem[]> {
  const [cfg, recent] = await Promise.all([
    Promise.all([
      getConfig('health.diskUsedPercent'),
      getConfig('health.memAvailableMb'),
      getConfig('health.containerMemPercent'),
      getConfig('health.backupMaxHours'),
      getConfig('health.maintenanceMaxHours'),
      getConfig('health.sampleMaxMinutes'),
      getConfig('health.dbJumpPercent'),
      getConfig('health.s3JumpGb'),
    ]),
    db.serverHealthSample.findMany({ orderBy: { takenAt: 'desc' }, take: 2 }),
  ]);
  const [diskPct, memMb, containerPct, backupHours, maintHours, sampleMin, dbJumpPct, s3JumpGb] =
    cfg;
  const problems: Problem[] = [];
  const [latest, previous] = recent;
  const first = await db.serverHealthSample.findFirst({ orderBy: { takenAt: 'asc' } });

  if (!latest || now.getTime() - latest.takenAt.getTime() > sampleMin * 60_000) {
    // Nothing yet on a fresh install isn't a problem; a collector that stopped is.
    if (latest) {
      problems.push({
        key: 'sample.stale',
        detail: `No health snapshot from the server for ${Math.round((now.getTime() - latest.takenAt.getTime()) / 60_000)} minutes (the collector on the server may have stopped).`,
      });
    }
  }
  if (latest) {
    // Down on two snapshots in a row, so one slow answer isn't an alert.
    type Sample = NonNullable<typeof latest>;
    const both = (f: (s: Sample) => boolean) => f(latest) && (!previous || f(previous));
    if (both((s) => !s.appUp)) {
      problems.push({ key: 'app.down', detail: 'The app (api.jaxside.com) isn’t answering.' });
    }
    if (both((s) => !s.webUp)) {
      problems.push({ key: 'web.down', detail: 'The website (jaxside.com) isn’t answering.' });
    }
    const pct = (latest.diskUsedMb / latest.diskTotalMb) * 100;
    if (pct >= diskPct) {
      problems.push({
        key: 'disk.full',
        detail: `The server’s disk is ${Math.round(pct)}% full (${fmtMb(latest.diskTotalMb - latest.diskUsedMb)} left).`,
      });
    }
    if (both((s) => s.memAvailableMb < memMb)) {
      problems.push({
        key: 'memory.low',
        detail: `The server has only ${fmtMb(latest.memAvailableMb)} of memory left.`,
      });
    }
    for (const c of containersOf(latest.containers)) {
      // Only containers with their own cap (the website's 768 MB); the rest share the server.
      if (c.limitMb >= latest.memTotalMb - 1 || c.limitMb <= 0) continue;
      const used = (c.memMb / c.limitMb) * 100;
      if (used >= containerPct) {
        problems.push({
          key: `container.${c.name}`.slice(0, 60),
          detail: `${c.name} is using ${Math.round(used)}% of its memory (${fmtMb(c.memMb)} of ${fmtMb(c.limitMb)}).`,
        });
      }
    }
    // Jumped too quickly: the database a day ago, the pictures since the day before.
    const dayAgo = await sampleBefore(new Date(now.getTime() - DAY));
    if (dayAgo && Number(dayAgo.dbBytes) > 0) {
      const grew = Number(latest.dbBytes) - Number(dayAgo.dbBytes);
      if (grew >= 50 * MB && (grew / Number(dayAgo.dbBytes)) * 100 >= dbJumpPct) {
        problems.push({
          key: 'db.jump',
          detail: `The database grew ${fmtMb(grew / MB)} in a day (${Math.round((grew / Number(dayAgo.dbBytes)) * 100)}%). Spam or a stuck job?`,
        });
      }
    }
    const s3 = await db.serverHealthSample.findMany({
      where: { s3MediaBytes: { not: null } },
      orderBy: { takenAt: 'desc' },
      take: 2,
    });
    if (s3.length === 2) {
      const grew = Number(s3[0]!.s3MediaBytes) - Number(s3[1]!.s3MediaBytes);
      if (grew >= s3JumpGb * GB) {
        problems.push({
          key: 's3.jump',
          detail: `Pictures and videos in S3 grew ${fmtMb(grew / MB)} in a day.`,
        });
      }
    }
  }

  // Backups and the nightly maintenance: the last run failed, or the last good one is too old.
  for (const [job, maxHours, label] of [
    [JOBS.backup, backupHours, 'database backup'],
    [JOBS.maintenance, maintHours, 'nightly maintenance'],
  ] as const) {
    const { last, lastOk } = await lastRuns(job);
    if (last && !last.ok) {
      problems.push({
        key: `${job}.failed`,
        detail: `The last ${label} failed (${hoursAgo(last.finishedAt, now)} h ago)${last.note ? `: ${last.note}` : ''}.`,
      });
    }
    const since = lastOk?.finishedAt ?? null;
    // With no good run on record, count from when health tracking started.
    const from = since ?? first?.takenAt ?? null;
    if (from && now.getTime() - from.getTime() > maxHours * HOUR) {
      problems.push({
        key: `${job}.stale`,
        detail: since
          ? `No good ${label} for ${hoursAgo(since, now)} hours.`
          : `No ${label} recorded since health tracking started (${hoursAgo(from, now)} hours ago).`,
      });
    }
  }
  return problems;
}

/**
 * Compares what's wrong now with the alerts already open; emails new ones and reminders (at most
 * daily) and "all clear" for the ones that ended, in one email. Also drops old snapshots.
 */
export async function checkHealthAlerts(
  now = new Date(),
  to: string | null = getEnv().HEALTH_ALERT_EMAIL ?? getEnv().SUPPORT_INBOX ?? null,
) {
  const problems = await findProblems(now);
  const open = await db.healthAlert.findMany();
  const openKeys = new Set(open.map((a) => a.key));
  const nowKeys = new Set(problems.map((p) => p.key));

  const fresh = problems.filter((p) => !openKeys.has(p.key));
  const reminders = problems.filter((p) => {
    const a = open.find((o) => o.key === p.key);
    return a && (!a.lastSentAt || now.getTime() - a.lastSentAt.getTime() >= DAY);
  });
  const cleared = open.filter((a) => !nowKeys.has(a.key));

  const toSend = [...fresh, ...reminders];
  if (to && (toSend.length || cleared.length)) {
    await sendSafely(healthAlertEmail(to, toSend, cleared), 'health-alert');
  }
  const sentAt = to ? now : null;
  await db.$transaction([
    ...fresh.map((p) =>
      db.healthAlert.create({
        data: { key: p.key, since: now, detail: p.detail, lastSentAt: sentAt },
      }),
    ),
    ...problems
      .filter((p) => openKeys.has(p.key))
      .map((p) =>
        db.healthAlert.update({
          where: { key: p.key },
          data: {
            detail: p.detail,
            ...(reminders.some((r) => r.key === p.key) && sentAt ? { lastSentAt: sentAt } : {}),
          },
        }),
      ),
    db.healthAlert.deleteMany({ where: { key: { in: cleared.map((c) => c.key) } } }),
  ]);
  const keepDays = await getConfig('health.keepDays');
  const pruned = await db.serverHealthSample.deleteMany({
    where: { takenAt: { lt: new Date(now.getTime() - keepDays * DAY) } },
  });
  await db.jobRun.deleteMany({ where: { finishedAt: { lt: new Date(now.getTime() - 90 * DAY) } } });
  return {
    problems: problems.length,
    emailed: !!to && (toSend.length > 0 || cleared.length > 0),
    newAlerts: fresh.length,
    cleared: cleared.length,
    pruned: pruned.count,
  };
}

function healthAlertEmail(to: string, problems: Problem[], cleared: { detail: string }[]) {
  const subject = problems.length
    ? `JaxSide health: ${problems.length} problem${problems.length === 1 ? '' : 's'}`
    : 'JaxSide health: all clear';
  const intro = [
    ...(problems.length ? ['Something on the JaxSide server needs a look:'] : []),
    ...problems.map((p) => `• ${p.detail}`),
    ...(cleared.length ? ['Back to normal:'] : []),
    ...cleared.map((c) => `✓ Fixed: ${c.detail}`),
    'See Admin → Dashboard → Server health for the numbers.',
  ];
  return {
    to,
    subject,
    text: intro.join('\n\n'),
    html: renderEmail({ preheader: intro[1] ?? intro[0]!, heading: subject, intro }),
  };
}
