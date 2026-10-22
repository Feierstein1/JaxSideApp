-- P13.8 follow-up: the radius rule from the User table ("User_radius_positive") went away when
-- its columns moved to UserSettings (dropping a column drops the CHECKs that use it). Same rule here.
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_radius_positive"
  CHECK (("generalRadiusMiles" IS NULL OR "generalRadiusMiles" > 0)
     AND ("businessRadiusMiles" IS NULL OR "businessRadiusMiles" > 0));
