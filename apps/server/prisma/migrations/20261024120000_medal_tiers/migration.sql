-- D122: medal levels (1 Bronze, 2 Silver, 3 Gold, 4 Platinum). Existing medals start at Bronze;
-- the next daily check raises them to whatever level they already qualify for.
ALTER TABLE "UserAchievement" ADD COLUMN     "tier" SMALLINT NOT NULL DEFAULT 1,
ADD COLUMN     "tierAt" TIMESTAMPTZ(3);

ALTER TABLE "UserAchievement"
  ADD CONSTRAINT "UserAchievement_tier_range" CHECK ("tier" BETWEEN 1 AND 4);
