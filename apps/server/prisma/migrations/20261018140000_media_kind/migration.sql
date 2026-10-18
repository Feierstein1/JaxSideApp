-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'AUDIO', 'VIDEO');

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "kind" "MediaKind" NOT NULL DEFAULT 'IMAGE';

