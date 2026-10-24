-- D125: citywide discussion topics; posts in a topic are general posts with topicId set.
-- CreateEnum
CREATE TYPE "CityTopicStatus" AS ENUM ('SUGGESTED', 'ACTIVE', 'CLOSED', 'REJECTED');

-- AlterTable
ALTER TABLE "GeneralPost" ADD COLUMN     "topicId" UUID;

-- CreateTable
CREATE TABLE "CityTopic" (
    "id" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "status" "CityTopicStatus" NOT NULL DEFAULT 'ACTIVE',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "opensAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closesAt" TIMESTAMPTZ(3),
    "suggestedById" UUID,
    "createdById" UUID,
    "decisionReason" VARCHAR(300),
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CityTopic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CityTopic_status_pinned_opensAt_idx" ON "CityTopic"("status", "pinned", "opensAt");

-- CreateIndex
CREATE INDEX "CityTopic_suggestedById_createdAt_idx" ON "CityTopic"("suggestedById", "createdAt");

-- CreateIndex
CREATE INDEX "CityTopic_createdById_idx" ON "CityTopic"("createdById");

-- CreateIndex
CREATE INDEX "GeneralPost_topicId_status_createdAt_id_idx" ON "GeneralPost"("topicId", "status", "createdAt" DESC, "id" DESC) WHERE ("topicId" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "GeneralPost" ADD CONSTRAINT "GeneralPost_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "CityTopic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CityTopic" ADD CONSTRAINT "CityTopic_suggestedById_fkey" FOREIGN KEY ("suggestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CityTopic" ADD CONSTRAINT "CityTopic_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A topic that ends must end after it starts.
ALTER TABLE "CityTopic" ADD CONSTRAINT "CityTopic_closes_after_opens" CHECK ("closesAt" IS NULL OR "closesAt" > "opensAt");
