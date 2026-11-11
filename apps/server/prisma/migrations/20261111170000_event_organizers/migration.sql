-- CreateEnum
CREATE TYPE "OrganizerStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'REVOKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BusinessNoticeKind" ADD VALUE 'ORGANIZER_APPROVED';
ALTER TYPE "BusinessNoticeKind" ADD VALUE 'ORGANIZER_REJECTED';
ALTER TYPE "BusinessNoticeKind" ADD VALUE 'EVENT_APPROVED';
ALTER TYPE "BusinessNoticeKind" ADD VALUE 'EVENT_DENIED';

-- CreateTable
CREATE TABLE "EventOrganizer" (
    "accountId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "website" VARCHAR(300),
    "about" VARCHAR(500),
    "contactName" VARCHAR(100) NOT NULL,
    "contactPhone" VARCHAR(40),
    "status" "OrganizerStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),
    "decidedByAdminId" UUID,
    "decisionNote" VARCHAR(500),

    CONSTRAINT "EventOrganizer_pkey" PRIMARY KEY ("accountId")
);

-- CreateIndex
CREATE INDEX "EventOrganizer_status_createdAt_idx" ON "EventOrganizer"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "EventOrganizer" ADD CONSTRAINT "EventOrganizer_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;


