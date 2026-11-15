-- D245: empties the staging data before the server becomes production. RUN ONLY in the
-- switch-over (docs/PRODUCTION_SWITCHOVER.md), after a fresh backup, with Kenny's go-ahead.
-- Every person, business account, post, event, ad, chat, report and statistic is deleted.
--
-- KEPT: the map (places from OpenStreetMap and the ones JaxSide or people added, unless listed
-- for removal below), ZIP and Duval outlines, app settings, screening rules, plans and their
-- perks and prices, promo codes (their use counts reset), achievement definitions, the
-- maintenance switch, and the migration history.
--
--   psql -v confirm=WIPE -f wipe-for-launch.sql
--
-- Refuses to run unless `confirm` is WIPE. One transaction: all or nothing.

\set ON_ERROR_STOP on
SELECT CASE WHEN :'confirm' = 'WIPE' THEN 'wiping' ELSE (1 / 0)::text END AS go \gset

BEGIN;

CREATE TEMP TABLE keep_tables (name TEXT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO keep_tables VALUES
  ('_prisma_migrations'), ('spatial_ref_sys'), ('ZipArea'), ('ServiceArea'),
  ('AppConfiguration'), ('ScreeningRule'), ('Plan'), ('PlanEntitlement'), ('PlanPrice'),
  ('PromoCode'), ('Achievement'), ('BusinessPlace'), ('MaintenanceMode');

-- A kept table that points at a wiped one would be emptied by TRUNCATE ... CASCADE. Set those
-- links aside (AppConfiguration.updatedById → User today) and put them back after.
CREATE TEMP TABLE set_aside (tbl REGCLASS, name TEXT, def TEXT) ON COMMIT DROP;
INSERT INTO set_aside
SELECT c.conrelid::regclass, c.conname, pg_get_constraintdef(c.oid)
FROM pg_constraint c
WHERE c.contype = 'f'
  AND (SELECT relname FROM pg_class WHERE oid = c.conrelid) IN (SELECT name FROM keep_tables)
  AND (SELECT relname FROM pg_class WHERE oid = c.confrelid) NOT IN (SELECT name FROM keep_tables);
DO $$
DECLARE
  r RECORD;
  col TEXT;
BEGIN
  FOR r IN SELECT * FROM set_aside LOOP
    -- The pointing column (one column per link here) is cleared, then the link dropped.
    SELECT a.attname INTO col
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.conrelid = r.tbl AND c.conname = r.name;
    EXECUTE format('UPDATE %s SET %I = NULL', r.tbl, col);
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.name);
  END LOOP;
END $$;

-- Everything else, emptied.
DO $$
DECLARE
  tables TEXT;
BEGIN
  SELECT string_agg(format('%I', c.relname), ', ') INTO tables
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
    AND c.relname NOT IN (SELECT name FROM keep_tables);
  EXECUTE 'TRUNCATE ' || tables || ' RESTART IDENTITY CASCADE';
END $$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM set_aside LOOP
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.tbl, r.name, r.def);
  END LOOP;
END $$;

-- Places: the development sample places go; counts from test activity reset; owner-approved
-- detail changes (test owners) are forgotten so map imports update those places again.
DELETE FROM "BusinessPlace" WHERE "sourceName" = 'dev-seed';
UPDATE "BusinessPlace"
SET "postCount" = 0, "likeCount" = 0, "dislikeCount" = 0, "ratingsLockedAt" = NULL,
    "detailsSetAt" = NULL;
-- Promo codes: nobody has used them yet.
UPDATE "PromoCode" SET uses = 0;

COMMIT;

SELECT 'users' AS what, count(*) FROM "User"
UNION ALL SELECT 'business accounts', count(*) FROM "BusinessAccount"
UNION ALL SELECT 'events', count(*) FROM "Event"
UNION ALL SELECT 'places', count(*) FROM "BusinessPlace"
UNION ALL SELECT 'settings', count(*) FROM "AppConfiguration"
UNION ALL SELECT 'plans', count(*) FROM "Plan";
