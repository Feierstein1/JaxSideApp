-- D248: the boost rules in the database, so the app and the website can't disagree. A boost from
-- the plan (source PLAN) must fit the account's `boosts.perMonth` for that Jacksonville calendar
-- month, and an ad or event can't have two live boosts. Writers are serialised per account with
-- the same lock as ad slots ('ad-slots:' || accountId), taken here too.
CREATE OR REPLACE FUNCTION boost_rules() RETURNS trigger AS $$
DECLARE
  allowed INT;
  used INT;
  live INT;
  local_month TIMESTAMP;
  month_from TIMESTAMPTZ;
  month_to TIMESTAMPTZ;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ad-slots:' || NEW."accountId"::text));
  SELECT count(*) INTO live FROM "Boost" b
  WHERE b.id <> NEW.id AND b.status = 'ACTIVE' AND b."endsAt" > NEW."startsAt"
    AND ((NEW."adId" IS NOT NULL AND b."adId" = NEW."adId")
      OR (NEW."eventId" IS NOT NULL AND b."eventId" = NEW."eventId"));
  IF live > 0 THEN
    RAISE EXCEPTION 'This ad or event is already boosted' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.source <> 'PLAN' THEN
    RETURN NEW;
  END IF;
  SELECT (pe.value #>> '{}')::int INTO allowed
  FROM "Subscription" s
  JOIN "PlanEntitlement" pe ON pe."planId" = s."planId" AND pe.key = 'boosts.perMonth'
  WHERE s."accountId" = NEW."accountId"
    AND s.status IN ('TRIALING', 'ACTIVE', 'PAST_DUE')
    AND s."startsAt" <= NEW."startsAt"
    AND (s."endsAt" IS NULL OR s."endsAt" > NEW."startsAt")
  LIMIT 1;
  IF allowed IS NULL THEN
    allowed := 0;
  END IF;
  local_month := date_trunc('month', NEW."startsAt" AT TIME ZONE 'America/New_York');
  month_from := local_month AT TIME ZONE 'America/New_York';
  month_to := (local_month + interval '1 month') AT TIME ZONE 'America/New_York';
  SELECT count(*) INTO used FROM "Boost" b
  WHERE b."accountId" = NEW."accountId" AND b.source = 'PLAN' AND b.id <> NEW.id
    AND b."startsAt" >= month_from AND b."startsAt" < month_to;
  IF used >= allowed THEN
    RAISE EXCEPTION 'No boosts left this month (% of %)', used, allowed
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Boost_rules" BEFORE INSERT ON "Boost"
FOR EACH ROW EXECUTE FUNCTION boost_rules();
