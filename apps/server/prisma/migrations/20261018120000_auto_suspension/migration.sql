-- CreateEnum
CREATE TYPE "AutoSuspensionStatus" AS ENUM ('OPEN', 'CONFIRMED', 'RESTORED');

-- CreateTable
CREATE TABLE "AutoSuspension" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "reporterCount" INTEGER NOT NULL,
    "heldGeneralPostIds" UUID[],
    "heldBusinessPostIds" UUID[],
    "status" "AutoSuspensionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AutoSuspension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoSuspension_userId_status_idx" ON "AutoSuspension"("userId", "status");

-- AddForeignKey
ALTER TABLE "AutoSuspension" ADD CONSTRAINT "AutoSuspension_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

