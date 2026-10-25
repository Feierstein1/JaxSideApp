-- D134: topic rules: held after many reports, deleted by creator (kept a week), show creator.
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CityTopicStatus" ADD VALUE 'HELD';
ALTER TYPE "CityTopicStatus" ADD VALUE 'DELETED';

-- AlterTable
ALTER TABLE "CityTopic" ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "showCreator" BOOLEAN NOT NULL DEFAULT false;

