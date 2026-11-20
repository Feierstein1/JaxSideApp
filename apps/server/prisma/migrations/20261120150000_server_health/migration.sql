-- D275: server health on the admin dashboard, with alerts.

-- A snapshot every 10 minutes from the server itself (deploy/staging/health.sh); kept 30 days.
CREATE TABLE "ServerHealthSample" (
    "id" BIGSERIAL NOT NULL,
    "takenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memTotalMb" INTEGER NOT NULL,
    "memAvailableMb" INTEGER NOT NULL,
    "swapUsedMb" INTEGER NOT NULL,
    "diskTotalMb" INTEGER NOT NULL,
    "diskUsedMb" INTEGER NOT NULL,
    "load1" REAL NOT NULL,
    "load15" REAL NOT NULL,
    "dbBytes" BIGINT NOT NULL,
    "appUp" BOOLEAN NOT NULL,
    "webUp" BOOLEAN NOT NULL,
    -- [{ "name": "jaxside-app-1", "memMb": 200, "limitMb": 3832 }, ...]
    "containers" JSONB NOT NULL DEFAULT '[]',
    -- Once a day (S3 listing): null on the other samples.
    "s3MediaBytes" BIGINT,
    "s3MediaObjects" INTEGER,
    "s3BackupsBytes" BIGINT,
    "s3BackupsObjects" INTEGER,
    CONSTRAINT "ServerHealthSample_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServerHealthSample_takenAt_idx" ON "ServerHealthSample" ("takenAt" DESC);

-- Each backup and nightly maintenance run: when, and whether it worked.
CREATE TABLE "JobRun" (
    "id" BIGSERIAL NOT NULL,
    "job" VARCHAR(40) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "note" VARCHAR(500),
    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "JobRun_job_finishedAt_idx" ON "JobRun" ("job", "finishedAt" DESC);

-- An alert that's firing: emailed once, reminded at most daily, "all clear" when it ends.
CREATE TABLE "HealthAlert" (
    "key" VARCHAR(60) NOT NULL,
    "since" TIMESTAMPTZ(3) NOT NULL,
    "lastSentAt" TIMESTAMPTZ(3),
    "detail" VARCHAR(300) NOT NULL,
    CONSTRAINT "HealthAlert_pkey" PRIMARY KEY ("key")
);

-- Emails sent per day (the cost estimate; Amazon SES bills per email).
CREATE TABLE "EmailDailyCount" (
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EmailDailyCount_pkey" PRIMARY KEY ("day")
);
