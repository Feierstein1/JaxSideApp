-- D133: City Topics redesign: city / local topics, following, topic reports, poll suggestions.
-- CreateEnum
CREATE TYPE "TopicScope" AS ENUM ('CITY', 'LOCAL');

-- CreateEnum
CREATE TYPE "PollSuggestionStatus" AS ENUM ('WAITING', 'USED', 'REJECTED');

-- AlterEnum
ALTER TYPE "CityTopicStatus" ADD VALUE 'REMOVED';

-- AlterTable
ALTER TABLE "CityTopic" ADD COLUMN     "location" geography(Point, 4326),
ADD COLUMN     "scope" "TopicScope" NOT NULL DEFAULT 'CITY';

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "cityTopicId" UUID;

-- CreateTable
CREATE TABLE "TopicFollow" (
    "userId" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicFollow_pkey" PRIMARY KEY ("userId","topicId")
);

-- CreateTable
CREATE TABLE "PollSuggestion" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "question" VARCHAR(200) NOT NULL,
    "details" VARCHAR(500),
    "topic" VARCHAR(30) NOT NULL DEFAULT 'other',
    "status" "PollSuggestionStatus" NOT NULL DEFAULT 'WAITING',
    "decisionReason" VARCHAR(300),
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TopicFollow_topicId_idx" ON "TopicFollow"("topicId");

-- CreateIndex
CREATE INDEX "PollSuggestion_status_createdAt_idx" ON "PollSuggestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PollSuggestion_userId_createdAt_idx" ON "PollSuggestion"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CityTopic_location_idx" ON "CityTopic" USING GIST ("location");

-- CreateIndex
CREATE INDEX "CityTopic_scope_status_opensAt_idx" ON "CityTopic"("scope", "status", "opensAt");

-- CreateIndex
CREATE INDEX "Report_cityTopicId_idx" ON "Report"("cityTopicId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_cityTopicId_fkey" FOREIGN KEY ("cityTopicId") REFERENCES "CityTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicFollow" ADD CONSTRAINT "TopicFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicFollow" ADD CONSTRAINT "TopicFollow_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "CityTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollSuggestion" ADD CONSTRAINT "PollSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A local topic always has its spot; a city topic never needs one.
ALTER TABLE "CityTopic" ADD CONSTRAINT "CityTopic_local_has_location"
  CHECK ("scope" <> 'LOCAL' OR "location" IS NOT NULL);

-- A report has one target (now including a topic), or for a vanished message only evidence.
ALTER TABLE "Report" DROP CONSTRAINT "Report_one_target";
ALTER TABLE "Report" ADD CONSTRAINT "Report_one_target" CHECK (
  num_nonnulls("generalPostId", "businessPostId", "commentId", "photoId", "reportedUserId", "messageId", "cityTopicId") = 1
  OR (num_nonnulls("generalPostId", "businessPostId", "commentId", "photoId", "reportedUserId", "messageId", "cityTopicId") = 0
      AND "messageEvidence" IS NOT NULL));
