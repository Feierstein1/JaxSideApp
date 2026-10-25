-- D131: citywide topics get a category (the same list as poll topics); existing ones are "other".
-- AlterTable
ALTER TABLE "CityTopic" ADD COLUMN     "category" VARCHAR(30) NOT NULL DEFAULT 'other';

-- CreateIndex
CREATE INDEX "CityTopic_category_status_idx" ON "CityTopic"("category", "status");

