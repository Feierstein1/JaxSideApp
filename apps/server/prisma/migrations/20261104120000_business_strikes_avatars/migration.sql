-- AlterEnum
ALTER TYPE "BusinessNoticeKind" ADD VALUE 'STRIKE';

-- AlterTable
ALTER TABLE "ModerationAction" ADD COLUMN     "targetBusinessId" UUID;

-- AlterTable
ALTER TABLE "BusinessAccount" ADD COLUMN     "avatarMediaId" UUID,
ADD COLUMN     "suspendedUntil" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "ModerationAction_targetBusinessId_createdAt_idx" ON "ModerationAction"("targetBusinessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessAccount_avatarMediaId_key" ON "BusinessAccount"("avatarMediaId");

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_targetBusinessId_fkey" FOREIGN KEY ("targetBusinessId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessAccount" ADD CONSTRAINT "BusinessAccount_avatarMediaId_fkey" FOREIGN KEY ("avatarMediaId") REFERENCES "AdMedia"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- D191: a moderation action is about a person or a business login, never both.
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_one_account_target"
  CHECK ("targetUserId" IS NULL OR "targetBusinessId" IS NULL);
