-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'POST_COMMENT';
ALTER TYPE "NotificationType" ADD VALUE 'COMMENT_REPLY';
ALTER TYPE "NotificationType" ADD VALUE 'MENTION';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "businessPostId" UUID,
ADD COLUMN     "commentId" UUID,
ADD COLUMN     "count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "generalPostId" UUID;

-- CreateIndex
CREATE INDEX "Notification_generalPostId_idx" ON "Notification"("generalPostId") WHERE ("generalPostId" IS NOT NULL);

-- CreateIndex
CREATE INDEX "Notification_businessPostId_idx" ON "Notification"("businessPostId") WHERE ("businessPostId" IS NOT NULL);

-- CreateIndex
CREATE INDEX "Notification_commentId_idx" ON "Notification"("commentId") WHERE ("commentId" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_generalPostId_fkey" FOREIGN KEY ("generalPostId") REFERENCES "GeneralPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_businessPostId_fkey" FOREIGN KEY ("businessPostId") REFERENCES "BusinessPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

