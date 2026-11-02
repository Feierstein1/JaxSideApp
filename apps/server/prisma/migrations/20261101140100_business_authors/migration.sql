
-- AlterTable
ALTER TABLE "BusinessPost" ADD COLUMN     "businessAuthorId" UUID,
ALTER COLUMN "authorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "authorBusinessId" UUID;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "actorBusinessId" UUID;

-- CreateIndex
CREATE INDEX "BusinessPost_businessAuthorId_idx" ON "BusinessPost"("businessAuthorId");

-- CreateIndex
CREATE INDEX "Comment_authorBusinessId_idx" ON "Comment"("authorBusinessId");

-- CreateIndex
CREATE INDEX "Notification_actorBusinessId_idx" ON "Notification"("actorBusinessId") WHERE ("actorBusinessId" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "BusinessPost" ADD CONSTRAINT "BusinessPost_businessAuthorId_fkey" FOREIGN KEY ("businessAuthorId") REFERENCES "BusinessAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorBusinessId_fkey" FOREIGN KEY ("authorBusinessId") REFERENCES "BusinessAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorBusinessId_fkey" FOREIGN KEY ("actorBusinessId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- D172: exactly one author on a place post: a phone-app user or the place's business.
ALTER TABLE "BusinessPost" ADD CONSTRAINT "BusinessPost_one_author"
  CHECK (num_nonnulls("authorId", "businessAuthorId") = 1);

-- D172: the comment's author matches authorKind; BUSINESS replies only on place posts.
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_author_kind";
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_author_kind" CHECK (
  ("authorKind" = 'USER' AND "authorUserId" IS NOT NULL AND "authorGuestId" IS NULL
     AND "authorBusinessId" IS NULL)
  OR ("authorKind" = 'GUEST' AND "authorUserId" IS NULL AND "authorBusinessId" IS NULL)
  OR ("authorKind" = 'BUSINESS' AND "authorBusinessId" IS NOT NULL AND "authorUserId" IS NULL
     AND "authorGuestId" IS NULL AND "businessPostId" IS NOT NULL)
);

-- D172: a notification comes from a person or from a business, never both.
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_one_actor"
  CHECK (num_nonnulls("actorId", "actorBusinessId") <= 1);
