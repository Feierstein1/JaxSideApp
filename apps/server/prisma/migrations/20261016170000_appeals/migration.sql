-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('OPEN', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "Appeal" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "actionId" UUID NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'OPEN',
    "decisionNote" VARCHAR(500),
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Appeal_status_createdAt_idx" ON "Appeal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Appeal_userId_createdAt_idx" ON "Appeal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Appeal_actionId_idx" ON "Appeal"("actionId");

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ModerationAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: one open appeal per strike at a time.
CREATE UNIQUE INDEX "Appeal_one_open_per_action" ON "Appeal"("actionId") WHERE status = 'OPEN';
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_message_not_blank" CHECK (length(btrim(message)) > 0);
