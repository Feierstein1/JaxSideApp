-- D205: strikes and (optionally) removals put a notice in the person's bell, linked to the
-- moderation record. Postgres 12+ allows adding enum values together.
ALTER TYPE "NotificationType" ADD VALUE 'STRIKE';
ALTER TYPE "NotificationType" ADD VALUE 'CONTENT_REMOVED';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "moderationActionId" UUID;

-- CreateIndex
CREATE INDEX "Notification_moderationActionId_idx" ON "Notification"("moderationActionId") WHERE ("moderationActionId" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_moderationActionId_fkey" FOREIGN KEY ("moderationActionId") REFERENCES "ModerationAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

