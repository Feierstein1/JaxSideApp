-- A CHECK that evaluates to NULL passes, so "start set, end missing" got through the
-- first version. Both ends of the daily window are now set together or not at all.
-- Safe to re-run: a half-set window becomes "all day" before the new rule is added.
ALTER TABLE "Ad" DROP CONSTRAINT IF EXISTS "Ad_daily_window";
UPDATE "Ad" SET "dailyStartMin" = NULL, "dailyEndMin" = NULL
  WHERE ("dailyStartMin" IS NULL) <> ("dailyEndMin" IS NULL);
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_daily_window" CHECK (
  (("dailyStartMin" IS NULL) = ("dailyEndMin" IS NULL))
  AND ("dailyStartMin" IS NULL OR (
    "dailyStartMin" BETWEEN 0 AND 1439 AND "dailyEndMin" BETWEEN 1 AND 1440
    AND "dailyStartMin" <> "dailyEndMin"
  ))
);
