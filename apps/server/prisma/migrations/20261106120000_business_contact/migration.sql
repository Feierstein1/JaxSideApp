-- AlterTable
ALTER TABLE "ContactMessage" ADD COLUMN     "businessAccountId" UUID,
ADD COLUMN     "replyEmail" VARCHAR(254);

-- CreateIndex
CREATE INDEX "ContactMessage_businessAccountId_createdAt_idx" ON "ContactMessage"("businessAccountId", "createdAt");

-- AddForeignKey
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_businessAccountId_fkey" FOREIGN KEY ("businessAccountId") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- D213: a ticket has at most one sender: a person, a guest or a business login.
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_one_sender"
  CHECK (num_nonnulls("userId", "guestSessionId", "businessAccountId") <= 1);
