-- D204: Premium runs 5 ads at once.
ALTER TABLE "Plan" DROP CONSTRAINT "Plan_live_ad_limit";
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_live_ad_limit" CHECK ("liveAdLimit" BETWEEN 0 AND 5);

-- D204: a city-wide ad (Premium) shows to everyone in the area: no ZIPs or radius then.
ALTER TABLE "Ad" ADD COLUMN "cityWide" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_city_wide_no_targeting"
  CHECK (NOT "cityWide" OR (cardinality("zips") = 0 AND "radiusMeters" IS NULL));

-- D204: the owner's tier values (replace the D202 placeholders on the coded tiers).
WITH v ("code", "key", "value") AS (VALUES
  ('FREE', 'ads.live', '1'), ('FREE', 'ads.library', '3'), ('FREE', 'ads.reach', '"OWN_ZIP"'),
  ('FREE', 'ads.maxZips', '1'), ('FREE', 'ads.maxDays', '7'), ('FREE', 'insights', 'true'),
  ('FREE', 'insights.reach', '"OWN_ZIP"'), ('FREE', 'insights.nearbyZips', '0'),
  ('STANDARD', 'ads.live', '3'), ('STANDARD', 'ads.library', '20'),
  ('STANDARD', 'ads.reach', '"ZIPS"'), ('STANDARD', 'ads.maxZips', '3'),
  ('STANDARD', 'ads.maxDays', 'null'), ('STANDARD', 'insights', 'true'),
  ('STANDARD', 'insights.reach', '"NEARBY"'), ('STANDARD', 'insights.nearbyZips', '4'),
  ('PREMIUM', 'ads.live', '5'), ('PREMIUM', 'ads.library', '20'),
  ('PREMIUM', 'ads.reach', '"CITY"'), ('PREMIUM', 'ads.maxZips', '30'),
  ('PREMIUM', 'ads.maxDays', 'null'), ('PREMIUM', 'insights', 'true'),
  ('PREMIUM', 'insights.reach', '"ALL"'), ('PREMIUM', 'insights.nearbyZips', '0')
)
INSERT INTO "PlanEntitlement" ("id", "planId", "key", "value")
SELECT gen_random_uuid(), p."id", v."key", v."value"::jsonb
FROM v JOIN "Plan" p ON p."code" = v."code"
ON CONFLICT ("planId", "key") DO UPDATE SET "value" = EXCLUDED."value";

-- The old columns stay in step until the website reads entitlements (D202).
UPDATE "Plan" SET "liveAdLimit" = 1, "includesInsights" = true WHERE "code" = 'FREE';
UPDATE "Plan" SET "liveAdLimit" = 3, "includesInsights" = true WHERE "code" = 'STANDARD';
UPDATE "Plan" SET "liveAdLimit" = 5, "includesInsights" = true WHERE "code" = 'PREMIUM';
