-- P13.7 (D107): retention. Posts and comments get "statusChangedAt", the time their status last
-- changed (deleted by the author, removed or restored by a moderator), so the purge can count
-- 30 days / 1 year from it. A trigger sets it, so no code path can forget. Prisma ignores
-- triggers and functions (no drift).

-- AlterTable
ALTER TABLE "BusinessPost" ADD COLUMN     "statusChangedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "statusChangedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "GeneralPost" ADD COLUMN     "statusChangedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "BusinessPost_statusChangedAt_idx" ON "BusinessPost"("statusChangedAt") WHERE (status IN ('DELETED', 'REMOVED'));

-- CreateIndex
CREATE INDEX "Comment_statusChangedAt_idx" ON "Comment"("statusChangedAt") WHERE (status IN ('DELETED', 'REMOVED'));

-- CreateIndex
CREATE INDEX "GeneralPost_statusChangedAt_idx" ON "GeneralPost"("statusChangedAt") WHERE (status IN ('DELETED', 'REMOVED'));

-- CreateIndex
CREATE INDEX "Notification_readAt_idx" ON "Notification"("readAt") WHERE ("readAt" IS NOT NULL);


-- Set "statusChangedAt" whenever the status changes.
CREATE OR REPLACE FUNCTION set_status_changed_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW."statusChangedAt" := now();
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "GeneralPost_status_changed" BEFORE UPDATE OF status ON "GeneralPost"
  FOR EACH ROW EXECUTE FUNCTION set_status_changed_at();
CREATE TRIGGER "BusinessPost_status_changed" BEFORE UPDATE OF status ON "BusinessPost"
  FOR EACH ROW EXECUTE FUNCTION set_status_changed_at();
CREATE TRIGGER "Comment_status_changed" BEFORE UPDATE OF status ON "Comment"
  FOR EACH ROW EXECUTE FUNCTION set_status_changed_at();

-- Rows already deleted or removed: their last update is the best guess.
UPDATE "GeneralPost" SET "statusChangedAt" = "updatedAt" WHERE status IN ('DELETED', 'REMOVED');
UPDATE "BusinessPost" SET "statusChangedAt" = "updatedAt" WHERE status IN ('DELETED', 'REMOVED');
UPDATE "Comment" SET "statusChangedAt" = "updatedAt" WHERE status IN ('DELETED', 'REMOVED');

-- Settings (values someone already set are kept).
INSERT INTO "AppConfiguration" (key, value, description, "updatedAt") VALUES
  ('retention.notificationReadDays', '7'::jsonb, 'Read notifications deleted this many days after being read (D107)', now()),
  ('retention.notificationUnreadDays', '30'::jsonb, 'Unread notifications deleted after this many days; also the bell''s window (D107)', now()),
  ('retention.deletedContentDays', '30'::jsonb, 'Posts and comments deleted by their author are removed for good after this many days (D107)', now()),
  ('retention.removedContentDays', '365'::jsonb, 'Posts and comments removed by a moderator are kept this many days (D107)', now()),
  ('retention.unsentMessageDays', '1'::jsonb, 'Unsent messages: row deleted after this many days (D107)', now()),
  ('retention.removedMediaDays', '30'::jsonb, 'Removed or rejected media: row and file deleted after this many days (D107)', now()),
  ('retention.locationFlagDays', '90'::jsonb, 'Location flags deleted after this many days (D107)', now()),
  ('retention.installationUnseenDays', '365'::jsonb, 'Installations not seen this long are deleted, never banned ones (D107)', now()),
  ('retention.resolvedContactDays', '730'::jsonb, 'Resolved Contact-us tickets deleted after this many days (D107)', now())
ON CONFLICT (key) DO NOTHING;
