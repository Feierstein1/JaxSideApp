-- D269: bell notices when a topic is approved or turned down.
ALTER TYPE "NotificationType" ADD VALUE 'TOPIC_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'TOPIC_REJECTED';

ALTER TABLE "Notification" ADD COLUMN "topicId" UUID;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "CityTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Notification_topicId_idx" ON "Notification" ("topicId") WHERE "topicId" IS NOT NULL;
