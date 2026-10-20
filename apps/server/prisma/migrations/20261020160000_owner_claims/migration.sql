-- CreateEnum
CREATE TYPE "OwnerMethod" AS ENUM ('EMAIL', 'WEBSITE', 'PHONE');

-- CreateEnum
CREATE TYPE "OwnerClaimStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'REVOKED', 'CANCELLED');

-- AlterTable
ALTER TABLE "BusinessPlace" ADD COLUMN     "phone" VARCHAR(40),
ADD COLUMN     "website" VARCHAR(300);

-- CreateTable
CREATE TABLE "OwnerClaim" (
    "id" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "method" "OwnerMethod" NOT NULL,
    "status" "OwnerClaimStatus" NOT NULL DEFAULT 'PENDING',
    "emailDomain" VARCHAR(200),
    "codeHash" VARCHAR(100),
    "codeExpiresAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "publicCode" VARCHAR(20),
    "proofUrl" VARCHAR(500),
    "phoneCode" VARCHAR(10),
    "note" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMPTZ(3),
    "decidedAt" TIMESTAMPTZ(3),
    "decidedById" UUID,

    CONSTRAINT "OwnerClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnerClaim_placeId_status_idx" ON "OwnerClaim"("placeId", "status");

-- CreateIndex
CREATE INDEX "OwnerClaim_userId_status_idx" ON "OwnerClaim"("userId", "status");

-- CreateIndex
CREATE INDEX "OwnerClaim_status_createdAt_idx" ON "OwnerClaim"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "OwnerClaim" ADD CONSTRAINT "OwnerClaim_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "BusinessPlace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerClaim" ADD CONSTRAINT "OwnerClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerClaim" ADD CONSTRAINT "OwnerClaim_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- D103: one open claim per person and place.
CREATE UNIQUE INDEX "OwnerClaim_one_open" ON "OwnerClaim"("placeId", "userId") WHERE status = 'PENDING';
