-- P13.6 (D106): LocationCheck becomes a table partitioned by day on "receivedAt". Old days are
-- dropped whole once they pass the 30-day retention (instants, no row-by-row DELETE, nothing
-- left for vacuum), instead of deleting ~a day's rows every night. Daily rather than weekly so a
-- reading is never kept more than a day past 30 days (the Privacy Policy says 30).
--
-- Prisma can't model partitions, so:
-- - the parent stays "public"."LocationCheck" with the same columns, indexes and foreign keys
--   (the primary key gains "receivedAt", which every partition key must be part of);
-- - the daily pieces and a catch-all DEFAULT piece live in schema "jax_partitions", which Prisma
--   doesn't look at, so they never show up as drift (D109).
-- Pieces are created ahead and dropped by the maintenance job through the two functions below.

CREATE SCHEMA IF NOT EXISTS jax_partitions;

-- 1. Move the old table aside and free its constraint and index names.
ALTER TABLE "LocationCheck" RENAME TO "LocationCheck_old";
ALTER TABLE "LocationCheck_old"
  DROP CONSTRAINT "LocationCheck_pkey",
  DROP CONSTRAINT "LocationCheck_userId_fkey",
  DROP CONSTRAINT "LocationCheck_guestSessionId_fkey",
  DROP CONSTRAINT "LocationCheck_installationId_fkey",
  DROP CONSTRAINT "LocationCheck_point_required",
  DROP CONSTRAINT "LocationCheck_accuracy_nonneg",
  DROP CONSTRAINT "LocationCheck_one_actor";
DROP INDEX "LocationCheck_userId_receivedAt_idx";
DROP INDEX "LocationCheck_guestSessionId_receivedAt_idx";
DROP INDEX "LocationCheck_receivedAt_idx";
DROP INDEX "LocationCheck_installationId_idx";

-- 2. The partitioned table, with the same names Prisma expects.
CREATE TABLE "LocationCheck" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "guestSessionId" UUID,
    "installationId" UUID,
    "action" VARCHAR(40) NOT NULL,
    "point" geography(Point, 4326),
    "accuracyMeters" DOUBLE PRECISION NOT NULL,
    "readingAt" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "LocationCheckResult" NOT NULL,
    "reason" VARCHAR(40),

    CONSTRAINT "LocationCheck_pkey" PRIMARY KEY ("id", "receivedAt"),
    CONSTRAINT "LocationCheck_point_required" CHECK ("point" IS NOT NULL),
    CONSTRAINT "LocationCheck_accuracy_nonneg" CHECK ("accuracyMeters" >= 0),
    CONSTRAINT "LocationCheck_one_actor" CHECK (num_nonnulls("userId", "guestSessionId") = 1)
) PARTITION BY RANGE ("receivedAt");

CREATE INDEX "LocationCheck_userId_receivedAt_idx" ON "LocationCheck"("userId", "receivedAt");
CREATE INDEX "LocationCheck_guestSessionId_receivedAt_idx" ON "LocationCheck"("guestSessionId", "receivedAt");
CREATE INDEX "LocationCheck_receivedAt_idx" ON "LocationCheck"("receivedAt");
CREATE INDEX "LocationCheck_installationId_idx" ON "LocationCheck"("installationId");

ALTER TABLE "LocationCheck" ADD CONSTRAINT "LocationCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LocationCheck" ADD CONSTRAINT "LocationCheck_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LocationCheck" ADD CONSTRAINT "LocationCheck_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Catch-all: a row whose day has no piece yet (the job fell behind) lands here instead of
-- failing, so a write is never refused for want of a partition.
CREATE TABLE jax_partitions."LocationCheck_default" PARTITION OF "LocationCheck" DEFAULT;

-- 3. Create one piece per UTC day from first_day for `days` days (existing ones are skipped).
--    Rows already in the catch-all for that day move into the new piece first.
CREATE OR REPLACE FUNCTION location_check_ensure_partitions(first_day date, days int) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  d date;
  part text;
  lo timestamptz;
  hi timestamptz;
  made int := 0;
BEGIN
  FOR i IN 0 .. days - 1 LOOP
    d := first_day + i;
    part := 'LocationCheck_p' || to_char(d, 'YYYYMMDD');
    CONTINUE WHEN to_regclass(format('jax_partitions.%I', part)) IS NOT NULL;
    lo := d::timestamp AT TIME ZONE 'UTC';
    hi := (d + 1)::timestamp AT TIME ZONE 'UTC';
    EXECUTE format(
      'CREATE TABLE jax_partitions.%I (LIKE public."LocationCheck" INCLUDING DEFAULTS INCLUDING CONSTRAINTS)',
      part);
    EXECUTE format(
      'WITH moved AS (DELETE FROM jax_partitions."LocationCheck_default"
                      WHERE "receivedAt" >= $1 AND "receivedAt" < $2 RETURNING *)
       INSERT INTO jax_partitions.%I SELECT * FROM moved', part)
      USING lo, hi;
    EXECUTE format(
      'ALTER TABLE public."LocationCheck" ATTACH PARTITION jax_partitions.%I FOR VALUES FROM (%L) TO (%L)',
      part, lo, hi);
    made := made + 1;
  END LOOP;
  RETURN made;
END
$$;

-- 4. Drop every daily piece whose whole day is older than `cutoff`, and delete older rows
--    from the catch-all. Returns how many rows went.
CREATE OR REPLACE FUNCTION location_check_drop_partitions(cutoff timestamptz) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
  r record;
  n bigint;
  total bigint := 0;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'public."LocationCheck"'::regclass
      AND c.relname ~ '^LocationCheck_p[0-9]{8}$'
  LOOP
    IF (to_date(substr(r.relname, 16), 'YYYYMMDD') + 1)::timestamp AT TIME ZONE 'UTC' <= cutoff THEN
      EXECUTE format('SELECT count(*) FROM jax_partitions.%I', r.relname) INTO n;
      EXECUTE format('DROP TABLE jax_partitions.%I', r.relname);
      total := total + n;
    END IF;
  END LOOP;
  WITH gone AS (DELETE FROM jax_partitions."LocationCheck_default"
                WHERE "receivedAt" < cutoff RETURNING 1)
  SELECT total + count(*) INTO total FROM gone;
  RETURN total;
END
$$;

-- 5. Pieces for the retention window and the week ahead, then move the existing rows in.
SELECT location_check_ensure_partitions(((now() AT TIME ZONE 'UTC')::date - 31), 39);
INSERT INTO "LocationCheck" SELECT * FROM "LocationCheck_old";
DROP TABLE "LocationCheck_old";
