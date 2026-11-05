-- AlterEnum


ALTER TYPE "ReportReason" ADD VALUE 'AD_MISLEADING';
ALTER TYPE "ReportReason" ADD VALUE 'AD_AI_FOOD';
ALTER TYPE "ReportReason" ADD VALUE 'AD_AI_IMAGE';

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "adId" UUID;

-- CreateIndex
CREATE INDEX "Report_adId_idx" ON "Report"("adId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- D209: a report is about exactly one thing; an ad is one of them now.
ALTER TABLE "Report" DROP CONSTRAINT "Report_one_target";
ALTER TABLE "Report" ADD CONSTRAINT "Report_one_target" CHECK (
  num_nonnulls("generalPostId", "businessPostId", "commentId", "photoId", "reportedUserId", "messageId", "cityTopicId", "adId") = 1
  OR (num_nonnulls("generalPostId", "businessPostId", "commentId", "photoId", "reportedUserId", "messageId", "cityTopicId", "adId") = 0
      AND "messageEvidence" IS NOT NULL));
