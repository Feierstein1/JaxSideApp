-- D231: events an account may add while on its plan. Free (the one free month, businesses
-- and event organizers alike): 10. Standard and Premium: no limit until the owner decides.
WITH v ("code", "key", "value") AS (VALUES
  ('FREE', 'events.limit', '10'),
  ('STANDARD', 'events.limit', 'null'),
  ('PREMIUM', 'events.limit', 'null')
)
INSERT INTO "PlanEntitlement" ("id", "planId", "key", "value")
SELECT gen_random_uuid(), p."id", v."key", v."value"::jsonb
FROM v JOIN "Plan" p ON p."code" = v."code"
ON CONFLICT ("planId", "key") DO UPDATE SET "value" = EXCLUDED."value";
