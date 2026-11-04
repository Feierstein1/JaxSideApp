-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "uploaderBusinessId" UUID,
ALTER COLUMN "uploaderId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Photo_uploaderBusinessId_createdAt_idx" ON "Photo"("uploaderBusinessId", "createdAt");

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_uploaderBusinessId_fkey" FOREIGN KEY ("uploaderBusinessId") REFERENCES "BusinessAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- D195: a photo is uploaded by a person or by a business login, exactly one.
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_one_uploader"
  CHECK (num_nonnulls("uploaderId", "uploaderBusinessId") = 1);
