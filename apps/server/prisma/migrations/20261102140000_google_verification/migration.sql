-- CreateEnum
CREATE TYPE "BusinessVerification" AS ENUM ('GOOGLE', 'ADMIN', 'LEGACY_CLAIM');

-- CreateEnum
CREATE TYPE "VerificationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "BusinessAccount" ADD COLUMN     "googleSub" VARCHAR(255);

-- AlterTable
ALTER TABLE "BusinessPlaceAccess" ADD COLUMN     "googleLocation" VARCHAR(200),
ADD COLUMN     "verifiedAt" TIMESTAMPTZ(3),
ADD COLUMN     "verifiedBy" "BusinessVerification";

-- CreateTable
CREATE TABLE "BusinessVerificationRequest" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "placeId" UUID,
    "placeName" VARCHAR(200) NOT NULL,
    "placeAddress" VARCHAR(300),
    "contactName" VARCHAR(100) NOT NULL,
    "contactPhone" VARCHAR(40),
    "note" VARCHAR(1000),
    "status" "VerificationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),
    "decidedByAdminId" UUID,
    "decisionNote" VARCHAR(500),

    CONSTRAINT "BusinessVerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessVerificationRequest_status_createdAt_idx" ON "BusinessVerificationRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessVerificationRequest_accountId_idx" ON "BusinessVerificationRequest"("accountId");

-- CreateIndex
CREATE INDEX "BusinessVerificationRequest_placeId_idx" ON "BusinessVerificationRequest"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessVerificationRequest_one_open" ON "BusinessVerificationRequest"("accountId", "placeId") WHERE (status = 'PENDING');

-- CreateIndex
CREATE UNIQUE INDEX "BusinessAccount_googleSub_key" ON "BusinessAccount"("googleSub");

-- AddForeignKey
ALTER TABLE "BusinessVerificationRequest" ADD CONSTRAINT "BusinessVerificationRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessVerificationRequest" ADD CONSTRAINT "BusinessVerificationRequest_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "BusinessPlace"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- D185: a verification request names a place (in the directory, or typed by the owner).
ALTER TABLE "BusinessVerificationRequest" ADD CONSTRAINT "BusinessVerificationRequest_has_place"
  CHECK (length(trim("placeName")) > 0);

-- D185: verification is recorded on Owner access only.
ALTER TABLE "BusinessPlaceAccess" ADD CONSTRAINT "BusinessPlaceAccess_verified_owner_only"
  CHECK ("verifiedBy" IS NULL OR role = 'OWNER');

-- D185: today's owners: verified in the phone app (LEGACY_CLAIM) or by an admin move (ADMIN).
UPDATE "BusinessPlaceAccess"
   SET "verifiedBy" = CASE WHEN "ownerClaimId" IS NOT NULL THEN 'LEGACY_CLAIM'::"BusinessVerification"
                           ELSE 'ADMIN'::"BusinessVerification" END,
       "verifiedAt" = "createdAt"
 WHERE role = 'OWNER' AND "verifiedBy" IS NULL;
