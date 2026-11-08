-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "chatEvidence" JSONB;

-- CreateTable
CREATE TABLE "ChatOffense" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatOffense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMute" (
    "userId" UUID NOT NULL,
    "until" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChatMute_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "ChatOffense_userId_createdAt_idx" ON "ChatOffense"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatOffense_createdAt_idx" ON "ChatOffense"("createdAt");

-- CreateIndex
CREATE INDEX "ChatMute_until_idx" ON "ChatMute"("until");

-- AddForeignKey
ALTER TABLE "ChatOffense" ADD CONSTRAINT "ChatOffense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMute" ADD CONSTRAINT "ChatMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
