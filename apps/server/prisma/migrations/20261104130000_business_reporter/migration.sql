-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "reporterBusinessId" UUID;

-- CreateIndex
CREATE INDEX "Report_reporterBusinessId_createdAt_idx" ON "Report"("reporterBusinessId", "createdAt");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterBusinessId_fkey" FOREIGN KEY ("reporterBusinessId") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- D194: a report has at most one reporter: a person, a guest or a business login.
ALTER TABLE "Report" DROP CONSTRAINT "Report_at_most_one_reporter";
ALTER TABLE "Report" ADD CONSTRAINT "Report_at_most_one_reporter"
  CHECK (num_nonnulls("reporterUserId", "reporterGuestId", "reporterBusinessId") <= 1);
