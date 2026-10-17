-- D71: one radius for everything location-based, at most 0.3 mi.
-- Settings: move the old defaults to the new ones (values someone changed are left alone).
UPDATE "AppConfiguration" SET value = '0.3'::jsonb WHERE key = 'radius.general.defaultMiles' AND value = '1'::jsonb;
UPDATE "AppConfiguration" SET value = '0.1'::jsonb WHERE key = 'radius.general.minMiles' AND value = '0.25'::jsonb;
UPDATE "AppConfiguration" SET value = '0.3'::jsonb WHERE key = 'radius.general.maxMiles' AND value = '1'::jsonb;
UPDATE "AppConfiguration" SET value = '0.3'::jsonb WHERE key = 'directory.maxListMiles' AND value = '1'::jsonb;

-- People's saved radius: snap to the nearest of 0.1 / 0.2 / 0.3 (anything larger becomes 0.3).
UPDATE "User" SET "generalRadiusMiles" = CASE
    WHEN "generalRadiusMiles" < 0.15 THEN 0.1
    WHEN "generalRadiusMiles" < 0.25 THEN 0.2
    ELSE 0.3 END
  WHERE "generalRadiusMiles" IS NOT NULL;
UPDATE "User" SET "businessRadiusMiles" = "generalRadiusMiles";
